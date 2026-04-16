import { Env } from './types';
import { isValidUUID } from './utils';
import { handleWebSocketUpgrade } from './websocket';
import { getVlessConfigPage, getSubscriptionConfig } from './config';

/**
 * Main Cloudflare Worker entry point for VLESS proxy
 *
 * Routes:
 * - WebSocket upgrade → VLESS proxy connection
 * - GET / → Health check
 * - GET /cf → Request metadata
 * - GET /{userID} → VLESS configuration page
 * - GET /sub/{userID} → Base64-encoded subscription config
 * - All other routes → 404
 */
export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext
  ): Promise<Response> {
    try {
      // Extract environment variables
      const userID = env.UUID;

      // Validate UUID
      if (!userID || !isValidUUID(userID)) {
        return new Response('Invalid or missing UUID configuration', {
          status: 500,
        });
      }

      // Extract first UUID for routing paths (if comma-separated)
      const userID_Path = userID.split(',')[0];

      // Route WebSocket upgrades
      const upgradeHeader = request.headers.get('Upgrade');
      if (upgradeHeader === 'websocket') {
        return handleWebSocketUpgrade(request, env, ctx);
      }

      // Route HTTP requests
      const url = new URL(request.url);
      const pathname = url.pathname;

      // GET / → Health check
      if (pathname === '/') {
        return new Response('VLESS Worker is running', {
          status: 200,
          headers: { 'Content-Type': 'text/plain' },
        });
      }

      // GET /cf → Request metadata (Cloudflare information)
      if (pathname === '/cf') {
        return new Response(JSON.stringify(request.cf, null, 2), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      // GET /{userID_Path} → VLESS configuration page
      if (pathname === `/${userID_Path}`) {
        const hostname = request.headers.get('Host') || url.hostname;
        const htmlContent = getVlessConfigPage(userID, hostname);
        return new Response(htmlContent, {
          status: 200,
          headers: { 'Content-Type': 'text/html;charset=utf-8' },
        });
      }

      // GET /sub/{userID_Path} → Subscription configuration (base64-encoded)
      if (pathname === `/sub/${userID_Path}`) {
        const hostname = request.headers.get('Host') || url.hostname;
        const configText = getSubscriptionConfig(userID, hostname);

        // Base64 encode the subscription config
        const base64Config = btoa(configText);

        return new Response(base64Config, {
          status: 200,
          headers: {
            'Content-Type': 'text/plain;charset=utf-8',
            'Content-Disposition': 'attachment; filename=subscription.txt',
          },
        });
      }

      // All other routes → 404
      return new Response('Not Found', {
        status: 404,
        headers: { 'Content-Type': 'text/plain' },
      });
    } catch (error) {
      // Top-level error handling
      console.error('Worker error:', error);
      return new Response(error?.toString() || 'Internal Server Error', {
        status: 500,
        headers: { 'Content-Type': 'text/plain' },
      });
    }
  },
};
