import { AddressType, Command, VlessParseResult } from './types';
import { uuidBytesToString } from './utils';

/**
 * Parse a VLESS protocol header from a binary buffer.
 *
 * Binary layout:
 *   [0]        version (1 byte)
 *   [1..16]    UUID (16 bytes)
 *   [17]       option length (1 byte)
 *   [18+opt]   command (1 byte: 1=TCP, 2=UDP)
 *   [+2]       port (big-endian uint16)
 *   [+1]       address type (1=IPv4, 2=domain, 3=IPv6)
 *   [+N]       address value (4 bytes IPv4, 1+N domain, 16 bytes IPv6)
 *
 * @param buffer - Raw VLESS handshake data
 * @param userID - Expected UUID (comma-separated list supported)
 * @returns Parsed header or error
 */
export function parseVlessHeader(buffer: ArrayBuffer, userID: string): VlessParseResult {
  if (buffer.byteLength < 24) {
    return { hasError: true, message: 'invalid data' };
  }

  const version = new Uint8Array(buffer.slice(0, 1));

  // Validate UUID
  const uuidBytes = new Uint8Array(buffer.slice(1, 17));
  const uuidString = uuidBytesToString(uuidBytes);
  const uuids = userID.includes(',') ? userID.split(',') : [userID];
  const isValidUser = uuids.some((id) => uuidString === id.trim());

  if (!isValidUser) {
    return { hasError: true, message: 'invalid user' };
  }

  // Option length (skip options for now)
  const optLength = new Uint8Array(buffer.slice(17, 18))[0];

  // Command
  const commandIndex = 18 + optLength;
  const command = new Uint8Array(buffer.slice(commandIndex, commandIndex + 1))[0];

  let isUDP: boolean;
  if (command === Command.TCP) {
    isUDP = false;
  } else if (command === Command.UDP) {
    isUDP = true;
  } else {
    return {
      hasError: true,
      message: `command ${command} is not supported, command 01-tcp, 02-udp, 03-mux`,
    };
  }

  // Port (big-endian uint16)
  const portIndex = commandIndex + 1;
  const portRemote = new DataView(buffer.slice(portIndex, portIndex + 2)).getUint16(0);

  // Address type
  const addressIndex = portIndex + 2;
  const addressType = new Uint8Array(buffer.slice(addressIndex, addressIndex + 1))[0];

  let addressValueIndex = addressIndex + 1;
  let addressValue = '';

  switch (addressType) {
    case AddressType.IPv4: {
      const ipv4Bytes = new Uint8Array(buffer.slice(addressValueIndex, addressValueIndex + 4));
      addressValue = ipv4Bytes.join('.');
      addressValueIndex += 4;
      break;
    }

    case AddressType.Domain: {
      const domainLength = new Uint8Array(buffer.slice(addressValueIndex, addressValueIndex + 1))[0];
      addressValueIndex += 1;
      addressValue = new TextDecoder().decode(
        buffer.slice(addressValueIndex, addressValueIndex + domainLength)
      );
      addressValueIndex += domainLength;
      break;
    }

    case AddressType.IPv6: {
      const ipv6View = new DataView(buffer.slice(addressValueIndex, addressValueIndex + 16));
      const groups: string[] = [];
      for (let i = 0; i < 8; i++) {
        groups.push(ipv6View.getUint16(i * 2).toString(16));
      }
      addressValue = groups.join(':');
      addressValueIndex += 16;
      break;
    }

    default:
      return {
        hasError: true,
        message: `invalid addressType: ${addressType}`,
      };
  }

  if (!addressValue) {
    return {
      hasError: true,
      message: `addressValue is empty, addressType is ${addressType}`,
    };
  }

  return {
    hasError: false,
    version,
    addressRemote: addressValue,
    addressType,
    portRemote,
    rawDataIndex: addressValueIndex,
    isUDP,
  };
}

/**
 * Build the 2-byte VLESS response header.
 * Format: [version, 0]
 *
 * @param version - The version byte array from the parsed request header
 * @returns 2-byte response header
 */
export function buildVlessResponse(version: Uint8Array): Uint8Array {
  return new Uint8Array([version[0], 0]);
}
