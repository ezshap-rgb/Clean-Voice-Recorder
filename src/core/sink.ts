/**
 * Byte-level output abstraction.
 *
 * The audio core writes through `FileWriter` rather than touching the filesystem
 * directly, which keeps it testable (tests use an in-memory writer) and lets long
 * recordings stream to disk instead of being buffered in memory.
 */

export interface FileWriter {
  /** Create/open the file. Must be called before any write. */
  open(): void;
  /** Append bytes sequentially at the current position. */
  append(bytes: Uint8Array): void;
  /** Write over the first `bytes.byteLength` bytes, leaving the rest of the file intact. */
  overwriteFromStart(bytes: Uint8Array): void;
  /** Total bytes written since `open()`. */
  readonly bytesWritten: number;
  /** Flush and release the file. */
  close(): void;
}

/**
 * A format-specific encoder. One instance produces one output file.
 */
export interface AudioSink {
  /** Write whatever container preamble the format needs. Called once. */
  begin(): void;
  /** Encode and store one block of mono 16-bit PCM at the sample rate given to the sink. */
  write(samples: Int16Array): void;
  /** Flush encoder state, patch deferred sizes, and finish the file. */
  finish(): void;
}

/** Reinterpret a typed array's bytes as unsigned, copying so buffers can be reused. */
export function copyToBytes(bytes: Int8Array | Uint8Array): Uint8Array {
  return new Uint8Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
}
