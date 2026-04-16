import { connect } from 'cloudflare:sockets';
import { safeCloseWebSocket, WS_READY_STATE_OPEN } from './utils';

/**
 * Handle a TCP proxy connection: connect to the remote, write initial data,
 * and relay TCP responses back to the WebSocket.
 *
 * If the direct connection yields no incoming data and a proxyIP is configured,
 * a retry connection through the proxy IP is attempted.
 *
 * All async relay work is registered via ctx.waitUntil() so the worker
 * stays alive until the relay completes.
 *
 * CRITICAL: This function never throws. All errors are caught and logged.
 *
 * @param address - Remote hostname or IP to connect to
 * @param port - Remote port
 * @param initialData - First payload (typically TLS ClientHello)
 * @param webSocket - Server-side WebSocket to relay data back on
 * @param vlessResponseHeader - VLESS header to prepend to the first response chunk
 * @param remoteSocket - Mutable wrapper for the connected Socket reference
 * @param proxyIP - Optional proxy IP for retry on failed direct connection
 * @param ctx - Execution context for waitUntil
 */
export function handleTCPProxy(
  address: string,
  port: number,
  initialData: Uint8Array,
  webSocket: WebSocket,
  vlessResponseHeader: Uint8Array,
  remoteSocket: { value: Socket | null },
  proxyIP: string | undefined,
  ctx: ExecutionContext
): void {
  // connectAndWrite: connect to a host:port and write the initial payload
  const connectAndWrite = async (
    targetAddress: string,
    targetPort: number
  ): Promise<Socket> => {
    const tcpSocket = connect({
      hostname: targetAddress,
      port: targetPort,
    });
    remoteSocket.value = tcpSocket;

    const writer = tcpSocket.writable.getWriter();
    await writer.write(initialData);
    writer.releaseLock();

    return tcpSocket;
  };

  // retry: reconnect via proxyIP (or same address) if direct yields no data
  const retry = async (): Promise<void> => {
    const retryAddress = proxyIP || address;
    try {
      const tcpSocket = await connectAndWrite(retryAddress, port);

      // Catch socket.closed rejections
      tcpSocket.closed
        .catch((err: unknown) => console.error('retry socket.closed error:', err))
        .finally(() => safeCloseWebSocket(webSocket));

      await relayTCPToWebSocket(tcpSocket, webSocket, vlessResponseHeader);
    } catch (err) {
      console.error('retry connection failed:', err);
      safeCloseWebSocket(webSocket);
    }
  };

  // Main relay pipeline -- wrapped in an async IIFE tracked by waitUntil
  const relayPromise = (async () => {
    try {
      const tcpSocket = await connectAndWrite(address, port);

      // Catch socket.closed rejections to prevent unhandled promise rejection
      tcpSocket.closed
        .catch((err: unknown) => console.error('socket.closed error:', err))
        .finally(() => safeCloseWebSocket(webSocket));

      const hasData = await relayTCPToWebSocket(
        tcpSocket,
        webSocket,
        vlessResponseHeader
      );

      // If direct connection yielded no data, try via proxyIP
      if (!hasData && proxyIP) {
        console.log(`No data from ${address}:${port}, retrying via ${proxyIP}`);
        // CRITICAL: use await -- never fire-and-forget
        await retry();
      }
    } catch (err) {
      console.error('handleTCPProxy error:', err);
      safeCloseWebSocket(webSocket);
    }
  })();

  ctx.waitUntil(relayPromise);
}

/**
 * Relay data from a TCP socket readable side to a WebSocket.
 *
 * Reads chunks from socket.readable and sends them over the WebSocket.
 * The VLESS response header is prepended to the very first chunk only.
 *
 * CRITICAL error-handling rules:
 * - Never throws inside the WritableStream write() method
 * - Uses controller.error() instead of throw
 * - All pipeTo rejections are caught
 *
 * @param socket - Connected TCP socket to read from
 * @param webSocket - WebSocket to write data to
 * @param vlessResponseHeader - Header to prepend to first chunk (consumed once)
 * @returns Promise resolving to true if any data was relayed, false otherwise
 */
export async function relayTCPToWebSocket(
  socket: Socket,
  webSocket: WebSocket,
  vlessResponseHeader: Uint8Array | null
): Promise<boolean> {
  let hasIncomingData = false;
  let header: Uint8Array | null = vlessResponseHeader;

  await socket.readable
    .pipeTo(
      new WritableStream({
        write(chunk: Uint8Array, controller) {
          hasIncomingData = true;

          // CRITICAL: check readyState before sending, use controller.error
          // instead of throw to avoid Error 1101
          if (webSocket.readyState !== WS_READY_STATE_OPEN) {
            controller.error(new Error('WebSocket is not open'));
            return;
          }

          if (header) {
            // Prepend VLESS response header to the first chunk
            const combined = new Uint8Array(header.byteLength + chunk.byteLength);
            combined.set(header, 0);
            combined.set(new Uint8Array(chunk), header.byteLength);
            webSocket.send(combined);
            header = null;
          } else {
            webSocket.send(chunk);
          }
        },

        close() {
          console.log(
            `TCP readable closed, hasIncomingData: ${hasIncomingData}`
          );
        },

        abort(reason) {
          console.error('TCP readable aborted:', reason);
        },
      })
    )
    .catch((error: unknown) => {
      console.error('relayTCPToWebSocket pipeTo error:', error);
      safeCloseWebSocket(webSocket);
    });

  return hasIncomingData;
}
