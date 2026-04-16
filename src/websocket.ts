import { Env } from './types';
import { base64ToArrayBuffer, safeCloseWebSocket } from './utils';
import { parseVlessHeader, buildVlessResponse } from './vless';
import { handleDNSQuery } from './dns';
import { handleTCPProxy } from './tcp';

/**
 * Handle a WebSocket upgrade request for VLESS proxy.
 *
 * Creates a WebSocket pair, accepts the server side, sets up the
 * bidirectional relay between the WebSocket and a TCP (or UDP/DNS)
 * connection, and returns the 101 Switching Protocols response.
 *
 * All async relay work is tracked via ctx.waitUntil() so that the
 * worker does not terminate before the relay completes.
 *
 * @param request - Incoming HTTP upgrade request
 * @param env - Cloudflare worker environment bindings
 * @param ctx - Execution context (for waitUntil)
 * @returns 101 WebSocket upgrade response
 */
export function handleWebSocketUpgrade(
  request: Request,
  env: Env,
  ctx: ExecutionContext
): Response {
  const webSocketPair = new WebSocketPair();
  const [client, server] = Object.values(webSocketPair);

  server.accept();

  const earlyDataHeader = request.headers.get('sec-websocket-protocol') || '';
  const readableStream = createReadableWebSocketStream(server, earlyDataHeader);

  // Mutable wrapper so the write() handler can assign the remote socket
  // after parsing the first VLESS header.
  let remoteSocket: { value: Socket | null } = { value: null };
  let udpStreamWrite: ((chunk: Uint8Array) => void) | null = null;
  let isDns = false;

  const dohURL = env.DNS_RESOLVER_URL || 'https://sky.rethinkdns.com/1:6IcAgAIAMgEsgMAAVDAgAAAI';

  // ws --> remote pipeline
  const pipelinePromise = readableStream
    .pipeTo(
      new WritableStream<ArrayBuffer | Uint8Array>({
        async write(chunk, controller) {
          // Normalise to Uint8Array
          const data =
            chunk instanceof Uint8Array
              ? chunk
              : new Uint8Array(chunk as ArrayBuffer);

          // DNS shortcut: if already identified as DNS, forward directly
          if (isDns && udpStreamWrite) {
            return udpStreamWrite(data);
          }

          // Subsequent chunks: forward to the already-connected remote socket
          if (remoteSocket.value) {
            const writer = remoteSocket.value.writable.getWriter();
            await writer.write(data);
            writer.releaseLock();
            return;
          }

          // ---- First chunk: parse VLESS header ----
          // Ensure we have a clean ArrayBuffer for header parsing.
          // Copy into a new ArrayBuffer to avoid SharedArrayBuffer issues
          // and to handle views into larger buffers.
          const headerBuffer = new ArrayBuffer(data.byteLength);
          new Uint8Array(headerBuffer).set(data);

          const result = parseVlessHeader(headerBuffer, env.UUID);

          if (result.hasError) {
            // CRITICAL: never throw inside write() -- use controller.error()
            controller.error(new Error(result.message));
            return;
          }

          const {
            portRemote,
            addressRemote,
            rawDataIndex,
            version,
            isUDP,
          } = result;

          // UDP is only allowed for DNS (port 53)
          if (isUDP && portRemote !== 53) {
            controller.error(new Error('UDP proxy only enabled for DNS which is port 53'));
            return;
          }

          const vlessResponseHeader = buildVlessResponse(version);
          const rawClientData = data.slice(rawDataIndex);

          if (isUDP && portRemote === 53) {
            isDns = true;
            const { write } = handleDNSQuery(server, vlessResponseHeader, dohURL);
            udpStreamWrite = write;
            udpStreamWrite(rawClientData);
            return;
          }

          // TCP connection -- delegate to tcp.ts
          // handleTCPProxy manages its own ctx.waitUntil internally
          handleTCPProxy(
            addressRemote,
            portRemote,
            rawClientData,
            server,
            vlessResponseHeader,
            remoteSocket,
            env.PROXYIP,
            ctx
          );
        },

        close() {
          console.log('WebSocket readable stream closed');
        },

        abort(reason) {
          console.log('WebSocket readable stream aborted:', reason);
        },
      })
    )
    .catch((err) => {
      console.error('WebSocket pipeTo error:', err);
    });

  // Track the full relay pipeline so the worker stays alive
  ctx.waitUntil(pipelinePromise);

  return new Response(null, {
    status: 101,
    webSocket: client,
  });
}

/**
 * Create a ReadableStream from a WebSocket, including optional 0-RTT early data.
 *
 * The stream yields ArrayBuffer / Uint8Array chunks from WebSocket messages.
 * If the sec-websocket-protocol header contained base64-encoded early data
 * it is decoded and enqueued before any WebSocket messages.
 *
 * @param webSocket - The server-side WebSocket to read from
 * @param earlyDataHeader - Base64-encoded early data from the protocol header
 * @returns ReadableStream of binary chunks from the WebSocket
 */
export function createReadableWebSocketStream(
  webSocket: WebSocket,
  earlyDataHeader: string
): ReadableStream<ArrayBuffer | Uint8Array> {
  let cancelled = false;

  return new ReadableStream({
    start(controller) {
      webSocket.addEventListener('message', (event) => {
        if (cancelled) return;
        const message = event.data;
        if (message instanceof ArrayBuffer) {
          controller.enqueue(message);
        } else if (message instanceof Uint8Array) {
          controller.enqueue(message);
        } else {
          // String messages -- encode to bytes (unlikely in binary protocol)
          controller.enqueue(new TextEncoder().encode(message as string));
        }
      });

      webSocket.addEventListener('close', () => {
        safeCloseWebSocket(webSocket);
        if (!cancelled) {
          try {
            controller.close();
          } catch {
            // Controller may already be closed
          }
        }
      });

      webSocket.addEventListener('error', (err) => {
        console.error('WebSocket error event:', err);
        try {
          controller.error(err);
        } catch {
          // Controller may already be errored/closed
        }
      });

      // Decode and enqueue early data (0-RTT)
      if (earlyDataHeader) {
        const { earlyData, error } = base64ToArrayBuffer(earlyDataHeader);
        if (error) {
          console.error('Early data decode error:', error);
          controller.error(error);
        } else if (earlyData) {
          controller.enqueue(earlyData);
        }
      }
    },

    cancel(reason) {
      console.log('ReadableStream cancelled:', reason);
      cancelled = true;
      safeCloseWebSocket(webSocket);
    },
  });
}
