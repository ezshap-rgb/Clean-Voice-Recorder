/**
 * Streams bytes to a real file.
 *
 * A single open handle is kept for the duration of the recording so audio is
 * appended in place; nothing is buffered in memory, which matters because an
 * hour of WAV is ~115 MB.
 */
import { File, FileMode, type FileHandle } from 'expo-file-system';
import type { FileWriter } from '../core/sink';

export class ExpoFileWriter implements FileWriter {
  private handle: FileHandle | null = null;
  private written = 0;

  constructor(private readonly file: File) {}

  open(): void {
    if (!this.file.exists) this.file.create();
    this.handle = this.file.open(FileMode.Append);
    this.written = 0;
  }

  append(bytes: Uint8Array): void {
    if (this.handle === null) throw new Error('FileWriter used before open()');
    if (bytes.byteLength === 0) return;

    this.handle.writeBytes(bytes);
    this.written += bytes.byteLength;
  }

  overwriteFromStart(bytes: Uint8Array): void {
    // Reopen for writing: the cursor starts at byte 0 and only the given bytes
    // are replaced, leaving the recorded audio after them untouched.
    const handle = this.file.open(FileMode.WriteOnly);
    try {
      handle.writeBytes(bytes);
    } finally {
      handle.close();
    }
  }

  get bytesWritten(): number {
    return this.written;
  }

  close(): void {
    this.handle?.close();
    this.handle = null;
  }
}
