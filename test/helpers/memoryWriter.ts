import type { FileWriter } from '../../src/core/sink';

/**
 * In-memory `FileWriter` used by the tests, mirroring the real one's semantics:
 * sequential appends plus an in-place overwrite of the leading bytes.
 */
export class MemoryFileWriter implements FileWriter {
  private buffer = new Uint8Array(0);
  private opened = false;

  bytesWritten = 0;

  open(): void {
    this.opened = true;
    this.buffer = new Uint8Array(0);
    this.bytesWritten = 0;
  }

  append(bytes: Uint8Array): void {
    if (!this.opened) throw new Error('MemoryFileWriter used before open()');

    const next = new Uint8Array(this.buffer.length + bytes.length);
    next.set(this.buffer, 0);
    next.set(bytes, this.buffer.length);
    this.buffer = next;
    this.bytesWritten += bytes.length;
  }

  overwriteFromStart(bytes: Uint8Array): void {
    if (bytes.length > this.buffer.length) {
      throw new Error('overwriteFromStart would grow the file');
    }
    const next = new Uint8Array(this.buffer);
    next.set(bytes, 0);
    this.buffer = next;
  }

  close(): void {
    this.opened = false;
  }

  /** Everything written so far. */
  get contents(): Uint8Array {
    return this.buffer;
  }
}
