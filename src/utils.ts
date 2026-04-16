/**
 * WebSocket ready state constants
 */
export const WS_READY_STATE_OPEN = 1;
export const WS_READY_STATE_CLOSING = 2;

/**
 * Default DNS-over-HTTPS URL for Rethink DNS
 */
export const DEFAULT_DOH_URL = 'https://sky.rethinkdns.com/1:6IcAgAIAMgEsgMAAVDAgAAAI';

/**
 * Validates if a string is a valid UUID v4
 * Format: 8-4-4-4-12 hex digits with version 4
 * Example: d342d11e-d424-4583-b36e-524ab1f0afa4
 *
 * @param uuid - The UUID string to validate
 * @returns true if valid UUID v4, false otherwise
 */
export function isValidUUID(uuid: string): boolean {
  const uuidv4Regex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidv4Regex.test(uuid);
}

/**
 * Decodes a base64 string to an ArrayBuffer
 * Handles URL-safe base64 encoding (replaces - with +, _ with /)
 *
 * @param base64Str - The base64 encoded string
 * @returns Object containing earlyData (decoded ArrayBuffer) or error
 */
export function base64ToArrayBuffer(
  base64Str: string
): { earlyData: ArrayBuffer | null; error: Error | null } {
  try {
    // Convert URL-safe base64 to standard base64
    let base64 = base64Str.replace(/-/g, '+').replace(/_/g, '/');

    // Add padding if needed
    const padding = base64.length % 4;
    if (padding) {
      base64 += '='.repeat(4 - padding);
    }

    // Decode base64 to binary string
    const binaryString = atob(base64);

    // Convert binary string to ArrayBuffer
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    return {
      earlyData: bytes.buffer,
      error: null,
    };
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    return {
      earlyData: null,
      error,
    };
  }
}

/**
 * Safely closes a WebSocket connection
 * Only closes if the readyState is OPEN (1) or CLOSING (2)
 * Catches and logs any errors without throwing
 *
 * @param socket - The WebSocket to close
 */
export function safeCloseWebSocket(socket: WebSocket): void {
  try {
    if (socket.readyState === WS_READY_STATE_OPEN || socket.readyState === WS_READY_STATE_CLOSING) {
      socket.close();
    }
  } catch (err) {
    console.error('Error closing WebSocket:', err);
  }
}

/**
 * Converts a 16-byte Uint8Array to a UUID string format
 * Format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx (lowercase hex)
 *
 * @param bytes - 16-byte Uint8Array representing the UUID
 * @returns UUID string in standard format
 */
export function uuidBytesToString(bytes: Uint8Array): string {
  if (bytes.length !== 16) {
    throw new Error('UUID bytes must be exactly 16 bytes');
  }

  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  return `${hex.substring(0, 8)}-${hex.substring(8, 12)}-${hex.substring(12, 16)}-${hex.substring(
    16,
    20
  )}-${hex.substring(20)}`;
}
