/**
 * Orchestrates one recording: microphone blocks in, an encoded file out.
 *
 * Deliberately free of React Native imports — the writer and the MP3 encoder are
 * injected — so the whole path can be exercised in tests with an in-memory
 * writer and the real LAME encoder.
 */
import { Mp3Sink, type Mp3EncoderFactory } from '../core/mp3';
import { PcmConverter, type PcmBlock } from '../core/pcm';
import type { AudioSink, FileWriter } from '../core/sink';
import {
  BITS_PER_SAMPLE,
  CAPTURE_CHANNELS,
  CAPTURE_SAMPLE_RATE,
  type Settings,
} from '../core/types';
import { WavSink } from '../core/wav';

export type RecordingOutcome = {
  /** Total bytes in the finished file. */
  bytes: number;
  /** Exact audio duration, derived from the number of samples captured. */
  durationSeconds: number;
  /** Sample rate the file was written at. */
  sampleRate: number;
};

export type RecordingSessionOptions = {
  settings: Settings;
  writer: FileWriter;
  createEncoder: Mp3EncoderFactory;
  /** Capture rate; must be the rate the microphone actually delivers. */
  sampleRate?: number;
};

/** Build the encoder for the chosen container. */
export function createSink(
  settings: Settings,
  writer: FileWriter,
  sampleRate: number,
  createEncoder: Mp3EncoderFactory
): AudioSink {
  if (settings.format === 'wav') {
    return new WavSink(writer, {
      sampleRate,
      channels: CAPTURE_CHANNELS,
      bitsPerSample: BITS_PER_SAMPLE,
    });
  }
  return new Mp3Sink(writer, sampleRate, settings.bitrate, createEncoder, CAPTURE_CHANNELS);
}

export class RecordingSession {
  readonly sampleRate: number;

  private readonly converter: PcmConverter;
  private readonly sink: AudioSink;
  private samplesWritten = 0;
  private latestLevel = 0;
  private peakLevel = 0;
  private started = false;
  private finished = false;

  constructor(private readonly options: RecordingSessionOptions) {
    this.sampleRate = options.sampleRate ?? CAPTURE_SAMPLE_RATE;
    this.converter = new PcmConverter(this.sampleRate);
    this.sink = createSink(options.settings, options.writer, this.sampleRate, options.createEncoder);
  }

  /** Open the output file and write any container preamble. */
  begin(): void {
    if (this.started) throw new Error('Recording session already started');
    this.started = true;
    this.options.writer.open();
    this.sink.begin();
  }

  /** Feed one block of microphone audio. Safe to call before `begin()`. */
  handleBlock(block: PcmBlock): void {
    if (!this.started || this.finished) return;

    const { samples, level } = this.converter.process(block);
    if (samples.length > 0) {
      this.sink.write(samples);
      this.samplesWritten += samples.length;
    }

    this.latestLevel = level;
    if (level > this.peakLevel) this.peakLevel = level;
  }

  /** Level of the most recent block, 0..1, for the level meter. */
  get level(): number {
    return this.latestLevel;
  }

  /** Loudest level seen so far, 0..1. */
  get peak(): number {
    return this.peakLevel;
  }

  get durationSeconds(): number {
    return this.samplesWritten / this.sampleRate;
  }

  get isFinished(): boolean {
    return this.finished;
  }

  /** Flush, patch the header, close the file and report what was written. */
  finish(): RecordingOutcome {
    if (!this.finished) {
      this.finished = true;
      this.sink.finish();
      this.options.writer.close();
    }

    return {
      bytes: this.options.writer.bytesWritten,
      durationSeconds: this.durationSeconds,
      sampleRate: this.sampleRate,
    };
  }
}
