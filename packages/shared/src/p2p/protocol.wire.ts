/**
 * Campus Mesh — Binary P2P DataChannel Wire Protocol
 *
 * Implements compact binary serialization and deserialization for DataChannel packets:
 * 0x01: BITFIELD
 * 0x02: HAVE
 * 0x03: REQUEST
 * 0x04: PIECE
 * 0x05: CHOKE
 * 0x06: UNCHOKE
 */

import {
  CAMPUS_MESH_PROTOCOL_VERSION,
  WireMessageType
} from '../constants.js';
import { Bitfield } from './bitfield.js';

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export interface BitfieldWireMessage {
  type: WireMessageType.BITFIELD;
  resourceId: string;
  totalChunks: number;
  bitfield: Bitfield;
}

export interface HaveWireMessage {
  type: WireMessageType.HAVE;
  resourceId: string;
  chunkIndex: number;
}

export interface RequestWireMessage {
  type: WireMessageType.REQUEST;
  resourceId: string;
  chunkIndex: number;
}

export interface PieceWireMessage {
  type: WireMessageType.PIECE;
  resourceId: string;
  chunkIndex: number;
  beginOffset: number;
  totalLength: number;
  data: Uint8Array;
}

export interface ChokeWireMessage {
  type: WireMessageType.CHOKE;
  resourceId: string;
}

export interface UnchokeWireMessage {
  type: WireMessageType.UNCHOKE;
  resourceId: string;
}

export type WireMessage =
  | BitfieldWireMessage
  | HaveWireMessage
  | RequestWireMessage
  | PieceWireMessage
  | ChokeWireMessage
  | UnchokeWireMessage;

/**
 * Common header encoding helper:
 * [0]: version (1 byte)
 * [1]: type (1 byte)
 * [2]: resourceIdLength (1 byte)
 * [3..3+N]: resourceId bytes
 */
function encodeCommonHeader(
  type: WireMessageType,
  resourceId: string,
  extraPayloadSize: number
): { buffer: Uint8Array; view: DataView; headerSize: number } {
  const resIdBytes = textEncoder.encode(resourceId);
  if (resIdBytes.length > 255) {
    throw new Error(`Resource ID exceeds maximum length of 255 bytes: ${resourceId}`);
  }

  const headerSize = 3 + resIdBytes.length;
  const totalSize = headerSize + extraPayloadSize;
  const buffer = new Uint8Array(totalSize);
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);

  buffer[0] = CAMPUS_MESH_PROTOCOL_VERSION;
  buffer[1] = type;
  buffer[2] = resIdBytes.length;
  buffer.set(resIdBytes, 3);

  return { buffer, view, headerSize };
}

/**
 * Encodes a BITFIELD message:
 * [header] + [totalChunks: 4B uint32] + [bitfieldBytes: ceil(totalChunks / 8)]
 */
export function encodeBitfield(
  resourceId: string,
  totalChunks: number,
  bitfield: Bitfield
): Uint8Array {
  const bfBytes = bitfield.toBytes();
  const extraSize = 4 + bfBytes.length;
  const { buffer, view, headerSize } = encodeCommonHeader(
    WireMessageType.BITFIELD,
    resourceId,
    extraSize
  );

  view.setUint32(headerSize, totalChunks, false); // Big-Endian
  buffer.set(bfBytes, headerSize + 4);

  return buffer;
}

/**
 * Encodes a HAVE message:
 * [header] + [chunkIndex: 4B uint32]
 */
export function encodeHave(resourceId: string, chunkIndex: number): Uint8Array {
  if (chunkIndex < 0) {
    throw new RangeError(`Chunk index cannot be negative: ${chunkIndex}`);
  }
  const { buffer, view, headerSize } = encodeCommonHeader(
    WireMessageType.HAVE,
    resourceId,
    4
  );
  view.setUint32(headerSize, chunkIndex, false);
  return buffer;
}

/**
 * Encodes a REQUEST message:
 * [header] + [chunkIndex: 4B uint32]
 */
export function encodeRequest(resourceId: string, chunkIndex: number): Uint8Array {
  if (chunkIndex < 0) {
    throw new RangeError(`Chunk index cannot be negative: ${chunkIndex}`);
  }
  const { buffer, view, headerSize } = encodeCommonHeader(
    WireMessageType.REQUEST,
    resourceId,
    4
  );
  view.setUint32(headerSize, chunkIndex, false);
  return buffer;
}

/**
 * Encodes a PIECE message:
 * [header] + [chunkIndex: 4B] + [beginOffset: 4B] + [totalLength: 4B] + [dataLength: 4B] + [data: dataLength bytes]
 */
export function encodePiece(
  resourceId: string,
  chunkIndex: number,
  beginOffset: number,
  totalLength: number,
  data: Uint8Array
): Uint8Array {
  if (chunkIndex < 0) throw new RangeError(`Chunk index cannot be negative: ${chunkIndex}`);
  if (beginOffset < 0) throw new RangeError(`Begin offset cannot be negative: ${beginOffset}`);
  if (totalLength < 0) throw new RangeError(`Total length cannot be negative: ${totalLength}`);

  const extraSize = 16 + data.length;
  const { buffer, view, headerSize } = encodeCommonHeader(
    WireMessageType.PIECE,
    resourceId,
    extraSize
  );

  view.setUint32(headerSize, chunkIndex, false);
  view.setUint32(headerSize + 4, beginOffset, false);
  view.setUint32(headerSize + 8, totalLength, false);
  view.setUint32(headerSize + 12, data.length, false);
  buffer.set(data, headerSize + 16);

  return buffer;
}

/**
 * Encodes a CHOKE message:
 * [header]
 */
export function encodeChoke(resourceId: string): Uint8Array {
  const { buffer } = encodeCommonHeader(WireMessageType.CHOKE, resourceId, 0);
  return buffer;
}

/**
 * Encodes an UNCHOKE message:
 * [header]
 */
export function encodeUnchoke(resourceId: string): Uint8Array {
  const { buffer } = encodeCommonHeader(WireMessageType.UNCHOKE, resourceId, 0);
  return buffer;
}

/**
 * Decodes any binary DataChannel wire message into a strongly-typed WireMessage object.
 */
export function decodeMessage(raw: ArrayBuffer | Uint8Array): WireMessage {
  const bytes = raw instanceof Uint8Array ? raw : new Uint8Array(raw);
  if (bytes.length < 3) {
    throw new Error(`Packet too short: ${bytes.length} bytes (minimum is 3 bytes)`);
  }

  const version = bytes[0];
  if (version !== CAMPUS_MESH_PROTOCOL_VERSION) {
    throw new Error(
      `Unsupported protocol version: ${version}, expected ${CAMPUS_MESH_PROTOCOL_VERSION}`
    );
  }

  const messageType = bytes[1] as WireMessageType;
  const resIdLength = bytes[2];
  const headerSize = 3 + resIdLength;

  if (bytes.length < headerSize) {
    throw new Error(
      `Malformed packet: declared resourceId length ${resIdLength} exceeds total packet size ${bytes.length}`
    );
  }

  const resourceId = textDecoder.decode(bytes.subarray(3, headerSize));
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  switch (messageType) {
    case WireMessageType.BITFIELD: {
      if (bytes.length < headerSize + 4) {
        throw new Error('Truncated BITFIELD packet: missing totalChunks field');
      }
      const totalChunks = view.getUint32(headerSize, false);
      const expectedBfBytes = Math.ceil(totalChunks / 8);
      const actualBfBytes = bytes.length - (headerSize + 4);

      if (actualBfBytes !== expectedBfBytes) {
        throw new Error(
          `BITFIELD byte length mismatch: expected ${expectedBfBytes} bytes for ${totalChunks} chunks, got ${actualBfBytes}`
        );
      }

      const bitfieldData = bytes.subarray(headerSize + 4);
      const bitfield = Bitfield.fromBytes(totalChunks, bitfieldData);
      return {
        type: WireMessageType.BITFIELD,
        resourceId,
        totalChunks,
        bitfield
      };
    }

    case WireMessageType.HAVE: {
      if (bytes.length < headerSize + 4) {
        throw new Error('Truncated HAVE packet: missing chunkIndex');
      }
      const chunkIndex = view.getUint32(headerSize, false);
      return {
        type: WireMessageType.HAVE,
        resourceId,
        chunkIndex
      };
    }

    case WireMessageType.REQUEST: {
      if (bytes.length < headerSize + 4) {
        throw new Error('Truncated REQUEST packet: missing chunkIndex');
      }
      const chunkIndex = view.getUint32(headerSize, false);
      return {
        type: WireMessageType.REQUEST,
        resourceId,
        chunkIndex
      };
    }

    case WireMessageType.PIECE: {
      if (bytes.length < headerSize + 16) {
        throw new Error('Truncated PIECE packet: missing chunk header metadata');
      }
      const chunkIndex = view.getUint32(headerSize, false);
      const beginOffset = view.getUint32(headerSize + 4, false);
      const totalLength = view.getUint32(headerSize + 8, false);
      const dataLength = view.getUint32(headerSize + 12, false);

      if (bytes.length < headerSize + 16 + dataLength) {
        throw new Error(
          `Truncated PIECE payload: declared ${dataLength} bytes, only ${bytes.length - (headerSize + 16)} available`
        );
      }

      const data = bytes.subarray(headerSize + 16, headerSize + 16 + dataLength);
      return {
        type: WireMessageType.PIECE,
        resourceId,
        chunkIndex,
        beginOffset,
        totalLength,
        data: new Uint8Array(data)
      };
    }

    case WireMessageType.CHOKE: {
      return {
        type: WireMessageType.CHOKE,
        resourceId
      };
    }

    case WireMessageType.UNCHOKE: {
      return {
        type: WireMessageType.UNCHOKE,
        resourceId
      };
    }

    default:
      throw new Error(`Unknown wire message opcode: 0x${bytes[1].toString(16)}`);
  }
}
