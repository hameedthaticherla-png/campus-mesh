/**
 * Campus Mesh — Bitfield Availability Tracker
 *
 * Implements MSB-first bit-level tracking of chunk availability for a resource.
 * Byte size = Math.ceil(totalChunks / 8).
 * Byte index = Math.floor(chunkIndex / 8).
 * Bit mask   = 1 << (7 - (chunkIndex % 8)).
 */

export class Bitfield {
  public readonly totalChunks: number;
  private readonly bytes: Uint8Array;

  constructor(totalChunks: number, initialBytes?: Uint8Array) {
    if (totalChunks < 0) {
      throw new Error(`Total chunks cannot be negative: ${totalChunks}`);
    }

    this.totalChunks = totalChunks;
    const requiredBytes = Math.ceil(totalChunks / 8);

    if (initialBytes) {
      if (initialBytes.length !== requiredBytes) {
        throw new Error(
          `Invalid bitfield byte length: expected ${requiredBytes}, got ${initialBytes.length}`
        );
      }
      this.bytes = new Uint8Array(initialBytes);
    } else {
      this.bytes = new Uint8Array(requiredBytes);
    }
  }

  /**
   * Marks chunkIndex as possessed (bit = 1).
   */
  public set(chunkIndex: number): void {
    this.assertBounds(chunkIndex);
    const byteIdx = Math.floor(chunkIndex / 8);
    const bitOffset = 7 - (chunkIndex % 8);
    this.bytes[byteIdx] |= (1 << bitOffset);
  }

  /**
   * Clears chunkIndex (bit = 0).
   */
  public clear(chunkIndex: number): void {
    this.assertBounds(chunkIndex);
    const byteIdx = Math.floor(chunkIndex / 8);
    const bitOffset = 7 - (chunkIndex % 8);
    this.bytes[byteIdx] &= ~(1 << bitOffset);
  }

  /**
   * Checks whether chunkIndex is possessed (bit === 1).
   */
  public has(chunkIndex: number): boolean {
    if (chunkIndex < 0 || chunkIndex >= this.totalChunks) {
      return false;
    }
    const byteIdx = Math.floor(chunkIndex / 8);
    const bitOffset = 7 - (chunkIndex % 8);
    return (this.bytes[byteIdx] & (1 << bitOffset)) !== 0;
  }

  /**
   * Returns the count of chunks currently possessed.
   */
  public count(): number {
    let count = 0;
    for (let i = 0; i < this.totalChunks; i++) {
      if (this.has(i)) {
        count++;
      }
    }
    return count;
  }

  /**
   * Checks if all chunks are possessed.
   */
  public isComplete(): boolean {
    if (this.totalChunks === 0) return true;
    return this.count() === this.totalChunks;
  }

  /**
   * Returns array of all chunk indices marked as available.
   */
  public getAvailableIndices(): number[] {
    const indices: number[] = [];
    for (let i = 0; i < this.totalChunks; i++) {
      if (this.has(i)) {
        indices.push(i);
      }
    }
    return indices;
  }

  /**
   * Returns array of all chunk indices not yet possessed.
   */
  public getMissingIndices(): number[] {
    const indices: number[] = [];
    for (let i = 0; i < this.totalChunks; i++) {
      if (!this.has(i)) {
        indices.push(i);
      }
    }
    return indices;
  }

  /**
   * Serializes the bitfield to a copy of its underlying byte array.
   */
  public toBytes(): Uint8Array {
    return new Uint8Array(this.bytes);
  }

  /**
   * Constructs a Bitfield from an existing byte buffer.
   */
  public static fromBytes(totalChunks: number, bytes: Uint8Array): Bitfield {
    return new Bitfield(totalChunks, bytes);
  }

  /**
   * Creates a bitfield with all bits set (100% available).
   */
  public static all(totalChunks: number): Bitfield {
    const bf = new Bitfield(totalChunks);
    for (let i = 0; i < totalChunks; i++) {
      bf.set(i);
    }
    return bf;
  }

  private assertBounds(index: number): void {
    if (index < 0 || index >= this.totalChunks) {
      throw new RangeError(
        `Chunk index ${index} is out of bounds for bitfield with ${this.totalChunks} chunks`
      );
    }
  }
}
