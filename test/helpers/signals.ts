/** Test signal generators. */

/** A mono 16-bit sine wave. */
export function toneInt16(
  seconds: number,
  sampleRate: number,
  frequency = 440,
  amplitude = 0.5
): Int16Array {
  const count = Math.round(seconds * sampleRate);
  const out = new Int16Array(count);
  for (let i = 0; i < count; i++) {
    out[i] = Math.round(amplitude * 32767 * Math.sin((2 * Math.PI * frequency * i) / sampleRate));
  }
  return out;
}

/** Split a sample block into `blockSize`-sample chunks, as the microphone would. */
export function chunk(samples: Int16Array, blockSize: number): Int16Array[] {
  const chunks: Int16Array[] = [];
  for (let offset = 0; offset < samples.length; offset += blockSize) {
    chunks.push(samples.subarray(offset, Math.min(offset + blockSize, samples.length)));
  }
  return chunks;
}

/**
 * Build the raw little-endian bytes of an int16 block, as the native microphone
 * stream delivers them.
 */
export function int16ToArrayBuffer(samples: Int16Array): ArrayBuffer {
  const copy = new Int16Array(samples.length);
  copy.set(samples);
  return copy.buffer;
}

/** Interleave mono samples into `channels` channels, scaled to -1..1 floats. */
export function toInterleavedFloat32(samples: Int16Array, channels: number): ArrayBuffer {
  const out = new Float32Array(samples.length * channels);
  for (let i = 0; i < samples.length; i++) {
    const value = samples[i] / 32768;
    for (let channel = 0; channel < channels; channel++) {
      out[i * channels + channel] = value;
    }
  }
  return out.buffer;
}
