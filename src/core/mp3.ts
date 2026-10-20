/**
 * MP3 output.
 *
 * The encoder is injected rather than imported so this module stays free of
 * third-party code and can be exercised in plain Node. The application binds the
 * real LAME port in `src/platform/mp3Encoder.ts`; tests bind the same real build
 * loaded straight from disk.
 */
import { copyToBytes, type AudioSink, type FileWriter } from './sink';

/** Subset of the LAME encoder API that we rely on. */
export interface Mp3EncoderInstance {
  encodeBuffer(left: Int16Array, right?: Int16Array): Uint8Array | Int8Array;
  flush(): Uint8Array | Int8Array;
}

export type Mp3EncoderFactory = (
  channels: number,
  sampleRate: number,
  bitrateKbps: number
) => Mp3EncoderInstance;

/** Multiple of 576 (the MPEG Layer III granule size); LAME prefers whole granules. */
export const MP3_BLOCK_SAMPLES = 1152;

/**
 * Streams mono 16-bit PCM to MP3 at a fixed bitrate.
 *
 * Input is re-chunked into whole granules so the encoder is fed consistently
 * regardless of how the microphone happens to size its buffers.
 */
export class Mp3Sink implements AudioSink {
  private readonly encoder: Mp3EncoderInstance;
  private readonly pending = new Int16Array(MP3_BLOCK_SAMPLES);
  private pendingLength = 0;

  constructor(
    private readonly writer: FileWriter,
    sampleRate: number,
    bitrateKbps: number,
    createEncoder: Mp3EncoderFactory,
    channels = 1
  ) {
    this.encoder = createEncoder(channels, sampleRate, bitrateKbps);
  }

  begin(): void {
    // MP3 has no header to reserve: frames are self-describing.
  }

  write(samples: Int16Array): void {
    let offset = 0;
    while (offset < samples.length) {
      const room = MP3_BLOCK_SAMPLES - this.pendingLength;
      const take = Math.min(room, samples.length - offset);
      this.pending.set(samples.subarray(offset, offset + take), this.pendingLength);
      this.pendingLength += take;
      offset += take;

      if (this.pendingLength === MP3_BLOCK_SAMPLES) {
        this.encodePending();
      }
    }
  }

  finish(): void {
    this.encodePending();
    const tail = this.encoder.flush();
    if (tail.length > 0) this.writer.append(copyToBytes(tail));
  }

  private encodePending(): void {
    if (this.pendingLength === 0) return;

    const block =
      this.pendingLength === MP3_BLOCK_SAMPLES
        ? this.pending
        : this.pending.subarray(0, this.pendingLength);

    const encoded = this.encoder.encodeBuffer(block);
    if (encoded.length > 0) this.writer.append(copyToBytes(encoded));

    this.pendingLength = 0;
  }
}
