/**
 * PCM helpers: turn whatever the microphone hands us into the mono 16-bit PCM
 * that both output formats are built from.
 *
 * The microphone stream reports the sample rate and channel count it *actually*
 * delivered, which may differ from what we asked for, so this module must handle
 * float32/int16 input, any channel count and any sample rate.
 */
import { CAPTURE_SAMPLE_RATE } from './types';

export type PcmEncoding = 'float32' | 'int16';

/** One block of microphone audio, as reported by the native stream. */
export type PcmBlock = {
  data: ArrayBuffer;
  encoding: PcmEncoding;
  /** Actual sample rate delivered, in Hz. */
  sampleRate: number;
  /** Actual channel count delivered. Samples are interleaved. */
  channels: number;
};

/**
 * Reinterpret raw PCM bytes as interleaved samples normalised to -1..1.
 * `float32` data is already normalised; `int16` data is little-endian.
 */
export function samplesFromBlock(data: ArrayBuffer, encoding: PcmEncoding): Float32Array {
  if (encoding === 'float32') return new Float32Array(data);

  const int16 = new Int16Array(data);
  const samples = new Float32Array(int16.length);
  for (let i = 0; i < int16.length; i++) {
    samples[i] = int16[i] / 32768;
  }
  return samples;
}

/** Average interleaved channels down to mono. */
export function downmixToMono(interleaved: Float32Array, channels: number): Float32Array {
  if (channels <= 1) return interleaved;

  const frames = Math.floor(interleaved.length / channels);
  const mono = new Float32Array(frames);
  for (let frame = 0; frame < frames; frame++) {
    let sum = 0;
    for (let channel = 0; channel < channels; channel++) {
      sum += interleaved[frame * channels + channel];
    }
    mono[frame] = sum / channels;
  }
  return mono;
}

/** Convert normalised samples to signed 16-bit PCM, clamping anything out of range. */
export function floatToInt16(samples: Float32Array): Int16Array {
  const out = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    const sample = samples[i];
    const clamped = sample > 1 ? 1 : sample < -1 ? -1 : sample;
    out[i] = clamped < 0 ? Math.round(clamped * 32768) : Math.round(clamped * 32767);
  }
  return out;
}

/** Root-mean-square amplitude of a block, in 0..1. Used by the level meter. */
export function rms(samples: Float32Array): number {
  if (samples.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < samples.length; i++) {
    sum += samples[i] * samples[i];
  }
  return Math.sqrt(sum / samples.length);
}

/**
 * Linear-interpolation resampler that keeps its position across calls, so
 * consecutive microphone blocks join without clicks or dropped samples.
 */
export class MonoResampler {
  private readonly ratio: number;
  private tail: Float32Array = new Float32Array(0);
  private position = 0;

  constructor(
    private readonly sourceRate: number,
    private readonly targetRate: number
  ) {
    this.ratio = sourceRate / targetRate;
  }

  /** True when no work is needed (rates match). */
  get isPassthrough(): boolean {
    return this.sourceRate === this.targetRate;
  }

  /** Resample one mono block. State carries over to the next call. */
  process(input: Float32Array): Float32Array {
    if (this.isPassthrough) return input;
    if (input.length === 0) return input;

    const data =
      this.tail.length === 0 ? input : concatF32(this.tail, input);

    const lastIndex = data.length - 1;
    // Linear interpolation needs a sample on both sides, so we can only emit an
    // output once at least two input samples are buffered.
    const outputCount =
      lastIndex >= 1 && this.position <= lastIndex
        ? Math.floor((lastIndex - this.position) / this.ratio) + 1
        : 0;

    if (outputCount === 0) {
      // Not enough input to interpolate yet, so consume nothing and wait.
      this.tail = data;
      return new Float32Array(0);
    }

    const out = new Float32Array(outputCount);
    for (let k = 0; k < outputCount; k++) {
      const index = this.position + k * this.ratio;
      const lower = Math.floor(index);
      const fraction = index - lower;
      const a = data[lower];
      const b = lower + 1 <= lastIndex ? data[lower + 1] : a;
      out[k] = a * (1 - fraction) + b * fraction;
    }

    const nextPosition = this.position + outputCount * this.ratio;
    // The last output can sit just past the end of this block: that remainder is
    // carried in `position` rather than being counted as consumed input, which
    // would drop samples and make the output progressively short.
    const consumed = Math.min(Math.floor(nextPosition), data.length);
    this.tail = data.slice(consumed);
    this.position = nextPosition - consumed;

    return out;
  }
}

function concatF32(a: Float32Array, b: Float32Array): Float32Array {
  const out = new Float32Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}

/** One microphone block after conversion. */
export type ConvertedBlock = {
  /** Mono, 16-bit, at the converter's target rate. */
  samples: Int16Array;
  /** Amplitude of this block in 0..1, for the level meter. */
  level: number;
};

/**
 * Stateful converter from microphone blocks to mono 16-bit PCM at the capture
 * sample rate. Handles downmix, resampling and bit-depth conversion, and reuses
 * resampler state so a long recording is seamless.
 */
export class PcmConverter {
  private resampler: MonoResampler | null = null;
  private resamplerSourceRate = -1;

  constructor(private readonly targetRate: number = CAPTURE_SAMPLE_RATE) {}

  /** Convert one microphone block, measuring its level on the way through. */
  process(block: PcmBlock): ConvertedBlock {
    const interleaved = samplesFromBlock(block.data, block.encoding);
    const mono = downmixToMono(interleaved, block.channels);
    const level = rms(mono);
    const resampled = this.resample(mono, block.sampleRate);
    return { samples: floatToInt16(resampled), level };
  }

  private resample(mono: Float32Array, sourceRate: number): Float32Array {
    if (sourceRate === this.targetRate) return mono;

    if (this.resampler === null || this.resamplerSourceRate !== sourceRate) {
      // The device changed rate mid-stream; start a fresh resampler.
      this.resampler = new MonoResampler(sourceRate, this.targetRate);
      this.resamplerSourceRate = sourceRate;
    }
    return this.resampler.process(mono);
  }
}
