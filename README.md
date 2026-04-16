# V2CloudFlare - VLESS Proxy Worker

A VLESS proxy implementation running on Cloudflare Workers, providing a lightweight and efficient proxy solution.

## Features

- VLESS protocol support
- WebSocket transport
- Custom DNS resolver configuration
- Cloudflare Workers edge deployment
- Zero-cost tier compatible

## Prerequisites

- Node.js 18 or higher
- A Cloudflare account
- Wrangler CLI (installed via npm)

## Setup

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Configure your UUID**:
   Edit `wrangler.toml` and update the `UUID` value in the `[vars]` section with your own UUID:
   ```toml
   [vars]
   UUID = "your-uuid-here"
   ```

3. **Optional configuration**:
   - `DNS_RESOLVER_URL`: Custom DNS resolver endpoint
   - `PROXYIP`: Specify a proxy IP if needed (uncomment in wrangler.toml)

## Development

Run the development server locally:

```bash
npm run dev
```

This starts a local server at `http://localhost:8787` for testing.

## Deployment

Deploy to Cloudflare Workers:

```bash
npm run deploy
```

After deployment, you'll receive a worker URL (e.g., `https://v2cloudnode.your-subdomain.workers.dev`).

## Type Checking

Verify TypeScript types:

```bash
npm run typecheck
```

## Usage

### VLESS URL Format

After deployment, configure your VLESS client with the following format:

```
vless://[UUID]@[WORKER_DOMAIN]:443?encryption=none&security=tls&type=ws&host=[WORKER_DOMAIN]&path=/[OPTIONAL_PATH]#V2CloudFlare
```

Example:
```
vless://85C3F92D-0AC3-4FBC-90AC-152FA0711803@v2cloudnode.your-subdomain.workers.dev:443?encryption=none&security=tls&type=ws&host=v2cloudnode.your-subdomain.workers.dev&path=/&sni=v2cloudnode.your-subdomain.workers.dev#V2CloudFlare
```

### Configuration Parameters

- **UUID**: Your unique identifier (configured in wrangler.toml)
- **WORKER_DOMAIN**: Your Cloudflare Worker domain
- **encryption**: Set to `none` for VLESS
- **security**: Set to `tls` for secure connections
- **type**: Set to `ws` for WebSocket transport
- **path**: WebSocket path (default: `/`)

## Project Structure

```
v2cloudflare/
├── src/
│   └── index.ts          # Main worker code
├── wrangler.toml         # Cloudflare Workers configuration
├── tsconfig.json         # TypeScript configuration
├── package.json          # Project dependencies
└── README.md            # This file
```

## Security Notes

- Keep your UUID secret
- Never commit `.env` or `.dev.vars` files
- Review Cloudflare Workers usage limits for your account tier
- Consider rotating your UUID periodically

## License

This project is provided as-is for educational and personal use.

## Support

For issues and questions, please refer to the VLESS protocol documentation and Cloudflare Workers documentation.
