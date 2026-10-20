/**
 * WAV (RIFF/WAVE) output.
 *
 * A WAV file needs its total data size in the header, but we are streaming a
 * recording whose length we do not know in advance. So the header is reserved
 * with zero sizes up front and patched once the recording finishes.
 */
import type { AudioSink, FileWriter } from './sink';

export const WAV_HEADER_BYTES = 44;

export type WavFormat = {
  sampleRate: number;
  channels: number;
  bitsPerSample: number;
};

/** Build a 44-byte canonical PCM WAV header describing `dataBytes` of audio. */
export function buildWavHeader(dataBytes: number, format: WavFormat): Uint8Array {
  const { sampleRate, channels, bitsPerSample } = format;
  const bytesPerSample = bitsPerSample / 8;
  const blockAlign = channels * bytesPerSample;

  const header = new Uint8Array(WAV_HEADER_BYTES);
  const view = new DataView(header.buffer);

  writeAscii(header, 0, 'RIFF');
  view.setUint32(4, 36 + dataBytes, true); // everything after this field
  writeAscii(header, 8, 'WAVE');

  writeAscii(header, 12, 'fmt ');
  view.setUint32(16, 16, true); // PCM fmt chunk length
  view.setUint16(20, 1, true); // format tag 1 = uncompressed PCM
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true); // byte rate
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);

  writeAscii(header, 36, 'data');
  view.setUint32(40, dataBytes, true);

  return header;
}

function writeAscii(target: Uint8Array, offset: number, text: string): void {
  for (let i = 0; i < text.length; i++) {
    target[offset + i] = text.charCodeAt(i);
  }
}

/**
 * View 16-bit samples as little-endian bytes. Android and iOS both run on
 * little-endian hardware, so the in-memory layout already matches the format.
 */
function rawBytes(samples: Int16Array): Uint8Array {
  return new Uint8Array(samples.buffer, samples.byteOffset, samples.byteLength);
}

/** Streams mono 16-bit PCM into a WAV file. */
export class WavSink implements AudioSink {
  private dataBytes = 0;

  constructor(
    private readonly writer: FileWriter,
    private readonly format: WavFormat
  ) {}

  begin(): void {
    // Reserve the header; `finish()` rewrites it with the real sizes.
    this.writer.append(buildWavHeader(0, this.format));
  }

  write(samples: Int16Array): void {
    if (samples.length === 0) return;
    this.writer.append(rawBytes(samples));
    this.dataBytes += samples.length * (this.format.bitsPerSample / 8);
  }

  finish(): void {
    this.writer.overwriteFromStart(buildWavHeader(this.dataBytes, this.format));
  }
}
