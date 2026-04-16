/**
 * Cloudflare Workers environment bindings for VLESS proxy
 * These are variables injected by Cloudflare at runtime
 */
export interface Env {
  /**
   * UUID for VLESS authentication
   * Used to validate incoming connections against the configured UUID
   * Format: UUID v4 (e.g., d342d11e-d424-4583-b36e-524ab1f0afa4)
   */
  UUID: string;

  /**
   * Optional proxy IP address override
   * Can be used to specify a custom IP address for proxy responses
   * If not provided, the connection's default IP will be used
   */
  PROXYIP?: string;

  /**
   * Optional DNS-over-HTTPS resolver URL
   * Used for domain name resolution if provided
   * Must be a valid HTTPS URL (e.g., https://dns.example.com/query)
   */
  DNS_RESOLVER_URL?: string;
}

/**
 * Address type constants for VLESS protocol
 * Determines how the remote address is encoded in the VLESS header
 */
export enum AddressType {
  /** IPv4 address (4 bytes) */
  IPv4 = 1,
  /** Domain name (variable length with length prefix) */
  Domain = 2,
  /** IPv6 address (16 bytes) */
  IPv6 = 3,
}

/**
 * Command type constants for VLESS protocol
 * Indicates the type of connection requested
 */
export enum Command {
  /** TCP connection */
  TCP = 1,
  /** UDP connection */
  UDP = 2,
}

/**
 * Parsed VLESS protocol header containing connection details
 * Extracted from the binary VLESS handshake
 */
export interface VlessHeader {
  /**
   * VLESS protocol version as a Uint8Array
   * Typically contains a single byte (0x00 for current VLESS version)
   */
  version: Uint8Array;

  /**
   * Remote address (hostname, IPv4, or IPv6)
   * The destination address to connect to
   * Examples: "example.com", "192.168.1.1", "::1"
   */
  addressRemote: string;

  /**
   * Address type indicator
   * Determines format of addressRemote (1 = IPv4, 2 = Domain, 3 = IPv6)
   */
  addressType: number;

  /**
   * Remote port number
   * The destination port to connect to (1-65535)
   */
  portRemote: number;

  /**
   * Index marking the start of raw data after the VLESS header
   * Used to separate header from payload data
   */
  rawDataIndex: number;

  /**
   * Indicates if this is a UDP connection
   * true = UDP (Command 2), false = TCP (Command 1)
   */
  isUDP: boolean;
}

/**
 * Result of parsing a VLESS header
 * Union type representing either successful parse or error state
 *
 * Success case: { hasError: false } & VlessHeader
 * - Contains all VlessHeader properties
 *
 * Error case: { hasError: true, message: string }
 * - Contains error description instead of header data
 */
export type VlessParseResult =
  | ({ hasError: false } & VlessHeader)
  | { hasError: true; message: string };
