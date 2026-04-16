/**
 * Generate a clean HTML page displaying the VLESS configuration string
 */
export function getVlessConfigPage(uuid: string, hostname: string): string {
  const vlessConfig = `vless://${uuid}@${hostname}:443?encryption=none&security=tls&type=ws&host=${hostname}&path=/\#${hostname}`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>VLESS Configuration - v2cloudnode</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
      line-height: 1.6;
      padding: 2rem;
      max-width: 900px;
      margin: 0 auto;
      background: #f5f5f5;
      color: #333;
    }

    h1 {
      margin-bottom: 2rem;
      font-size: 1.8rem;
      font-weight: 600;
    }

    .config-container {
      background: white;
      border-radius: 8px;
      padding: 1.5rem;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    }

    h2 {
      margin-bottom: 1rem;
      font-size: 1.2rem;
      font-weight: 500;
    }

    pre {
      background: #f8f8f8;
      border: 1px solid #ddd;
      border-radius: 4px;
      padding: 1rem;
      overflow-x: auto;
      word-wrap: break-word;
      white-space: pre-wrap;
      font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
      font-size: 0.9rem;
      line-height: 1.5;
    }

    @media (prefers-color-scheme: dark) {
      body {
        background: #1a1a1a;
        color: #e0e0e0;
      }

      .config-container {
        background: #2d2d2d;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
      }

      pre {
        background: #1e1e1e;
        border-color: #444;
        color: #e0e0e0;
      }
    }

    @media (max-width: 600px) {
      body {
        padding: 1rem;
      }

      h1 {
        font-size: 1.5rem;
      }

      pre {
        font-size: 0.8rem;
      }
    }
  </style>
</head>
<body>
  <h1>VLESS Configuration - v2cloudnode</h1>
  <div class="config-container">
    <h2>Connection String</h2>
    <pre>${vlessConfig}</pre>
  </div>
</body>
</html>`;
}

/**
 * Generate VLESS subscription configuration for HTTPS ports
 * Returns newline-separated configuration strings (not base64 encoded)
 */
export function getSubscriptionConfig(uuid: string, hostname: string): string {
  const httpsPorts = [443, 8443, 2053, 2096, 2087, 2083];

  const configs = httpsPorts.map(port => {
    return `vless://${uuid}@${hostname}:${port}?encryption=none&security=tls&type=ws&host=${hostname}&path=/\#${hostname}-${port}`;
  });

  return configs.join('\n');
}
