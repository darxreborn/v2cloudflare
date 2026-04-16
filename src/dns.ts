import { WS_READY_STATE_OPEN } from './utils';

/**
 * Handles UDP DNS queries by proxying them to a DNS-over-HTTPS resolver.
 *
 * DNS queries arrive in UDP wire format with a 2-byte big-endian length prefix
 * per message. Each query is forwarded to the DoH resolver via POST, and the
 * response is sent back over the WebSocket with the same 2-byte length framing.
 *
 * The very first response includes the VLESS response header prepended.
 *
 * @param webSocket - The WebSocket connection to send DNS responses on
 * @param vlessResponseHeader - VLESS header to prepend to the first response
 * @param dohURL - DNS-over-HTTPS resolver URL
 * @returns Object with a write method to feed incoming UDP-framed DNS data
 */
export function handleDNSQuery(
  webSocket: WebSocket,
  vlessResponseHeader: Uint8Array,
  dohURL: string
): { write: (chunk: Uint8Array) => void } {
  let isVlessHeaderSent = false;

  // Buffer for handling partial messages that span WebSocket frames
  let pendingBuffer: Uint8Array | null = null;

  const transformStream = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      // If we have leftover bytes from a previous chunk, prepend them
      let data: Uint8Array;
      if (pendingBuffer !== null) {
        data = new Uint8Array(pendingBuffer.byteLength + chunk.byteLength);
        data.set(pendingBuffer, 0);
        data.set(chunk, pendingBuffer.byteLength);
        pendingBuffer = null;
      } else {
        data = chunk;
      }

      let index = 0;
      while (index < data.byteLength) {
        // Need at least 2 bytes for the length prefix
        if (index + 2 > data.byteLength) {
          // Only 1 byte left — buffer it for the next chunk
          pendingBuffer = data.slice(index);
          return;
        }

        const udpPacketLength = (data[index] << 8) | data[index + 1];

        // Check if the full DNS message is available in this chunk
        if (index + 2 + udpPacketLength > data.byteLength) {
          // Partial message — buffer the remainder for the next chunk
          pendingBuffer = data.slice(index);
          return;
        }

        const udpData = data.slice(index + 2, index + 2 + udpPacketLength);
        index += 2 + udpPacketLength;
        controller.enqueue(udpData);
      }
    },

    flush(controller) {
      // If there are leftover bytes when the stream closes, they are
      // an incomplete DNS message — discard and log
      if (pendingBuffer !== null && pendingBuffer.byteLength > 0) {
        console.warn(
          `DNS stream closed with ${pendingBuffer.byteLength} buffered bytes (incomplete message discarded)`
        );
        pendingBuffer = null;
      }
      controller.terminate();
    },
  });

  // Pipe extracted DNS queries through the DoH resolver and back to the WebSocket
  transformStream.readable
    .pipeTo(
      new WritableStream<Uint8Array>({
        async write(dnsQuery) {
          try {
            const resp = await fetch(dohURL, {
              method: 'POST',
              headers: {
                'content-type': 'application/dns-message',
              },
              body: dnsQuery,
            });

            if (!resp.ok) {
              console.error(
                `DoH request failed: ${resp.status} ${resp.statusText}`
              );
              return;
            }

            const dnsResult = await resp.arrayBuffer();
            const resultSize = dnsResult.byteLength;

            // 2-byte big-endian length prefix
            const sizePrefix = new Uint8Array([
              (resultSize >> 8) & 0xff,
              resultSize & 0xff,
            ]);

            if (webSocket.readyState === WS_READY_STATE_OPEN) {
              if (isVlessHeaderSent) {
                webSocket.send(
                  await new Blob([sizePrefix, dnsResult]).arrayBuffer()
                );
              } else {
                webSocket.send(
                  await new Blob([
                    vlessResponseHeader,
                    sizePrefix,
                    dnsResult,
                  ]).arrayBuffer()
                );
                isVlessHeaderSent = true;
              }
            }
          } catch (error) {
            console.error('DoH fetch error:', error);
          }
        },
      })
    )
    .catch((error) => {
      console.error('DNS UDP pipeline error:', error);
    });

  const writer = transformStream.writable.getWriter();

  return {
    write(chunk: Uint8Array) {
      writer.write(chunk);
    },
  };
}
