import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  downmixToMono,
  floatToInt16,
  MonoResampler,
  PcmConverter,
  rms,
  samplesFromBlock,
} from '../src/core/pcm';
import { chunk, int16ToArrayBuffer, toInterleavedFloat32 } from './helpers/signals';

describe('floatToInt16', () => {
  it('scales and rounds', () => {
    const out = floatToInt16(Float32Array.from([0, 0.5, -0.5, 1, -1]));
    assert.deepEqual(Array.from(out), [0, 16384, -16384, 32767, -32768]);
  });

  it('clamps out-of-range input instead of wrapping', () => {
    const out = floatToInt16(Float32Array.from([2, -2, 1.5]));
    assert.deepEqual(Array.from(out), [32767, -32768, 32767]);
  });
});

describe('samplesFromBlock', () => {
  it('normalises int16 input to -1..1', () => {
    const samples = Int16Array.from([0, 32767, -32768]);
    const out = samplesFromBlock(int16ToArrayBuffer(samples), 'int16');
    assert.equal(out.length, 3);
    assert.equal(out[0], 0);
    assert.ok(Math.abs(out[1] - 32767 / 32768) < 1e-6);
    assert.equal(out[2], -1);
  });

  it('passes float32 input straight through', () => {
    const out = samplesFromBlock(Float32Array.from([0.25, -0.75]).buffer, 'float32');
    assert.deepEqual(Array.from(out), [0.25, -0.75]);
  });
});

describe('downmixToMono', () => {
  it('averages interleaved channels', () => {
    const out = downmixToMono(Float32Array.from([1, 0, 0.5, 0.5, -1, 1]), 2);
    assert.deepEqual(Array.from(out), [0.5, 0.5, 0]);
  });

  it('leaves mono input untouched', () => {
    const mono = Float32Array.from([0.1, 0.2]);
    assert.equal(downmixToMono(mono, 1), mono);
  });
});

describe('rms', () => {
  it('measures amplitude', () => {
    assert.equal(rms(Float32Array.from([])), 0);
    assert.ok(Math.abs(rms(Float32Array.from([1, -1, 1, -1])) - 1) < 1e-6);
    assert.equal(rms(Float32Array.from([0, 0])), 0);
  });
});

describe('MonoResampler', () => {
  it('is a passthrough when rates match', () => {
    const resampler = new MonoResampler(16000, 16000);
    const input = Float32Array.from([1, 2, 3]);
    assert.equal(resampler.isPassthrough, true);
    assert.equal(resampler.process(input), input);
  });

  it('keeps a constant signal constant, including across block seams', () => {
    const resampler = new MonoResampler(48000, 16000);
    const outputs = [
      resampler.process(new Float32Array(1600).fill(0.5)),
      resampler.process(new Float32Array(1600).fill(0.5)),
      resampler.process(new Float32Array(1600).fill(0.5)),
    ];

    for (const block of outputs) {
      for (const value of block) {
        // A seam that dropped or extrapolated samples would show up as a deviation.
        assert.ok(Math.abs(value - 0.5) < 1e-6, `expected 0.5, got ${value}`);
      }
    }
  });

  it('decimates by the rate ratio without losing audio', () => {
    const resampler = new MonoResampler(48000, 16000);
    const inputSamples = 48000;
    let produced = 0;

    for (const part of chunkFloat(new Float32Array(inputSamples).fill(0.25), 1600)) {
      produced += resampler.process(part).length;
    }

    // 48 kHz -> 16 kHz is an exact 3:1 decimation, so no sample may be gained or lost.
    assert.equal(produced, inputSamples / 3);
  });

  it('preserves a ramp across a block boundary', () => {
    const resampler = new MonoResampler(32000, 16000);
    const ramp = new Float32Array(2000);
    for (let i = 0; i < ramp.length; i++) ramp[i] = i / ramp.length;

    const first = resampler.process(ramp.subarray(0, 1000));
    const second = resampler.process(ramp.subarray(1000));
    const combined = Float32Array.from([...first, ...second]);

    for (let i = 1; i < combined.length; i++) {
      assert.ok(combined[i] >= combined[i - 1], `not monotonic at ${i}`);
    }
    assert.ok(combined.length > 900 && combined.length < 1100);
  });
});

describe('PcmConverter', () => {
  it('passes matching-rate mono int16 input through unchanged', () => {
    const converter = new PcmConverter(16000);
    const samples = Int16Array.from([100, -200, 300, -400]);
    const block = {
      data: int16ToArrayBuffer(samples),
      encoding: 'int16' as const,
      sampleRate: 16000,
      channels: 1,
    };

    const result = converter.process(block);
    assert.deepEqual(Array.from(result.samples), Array.from(samples));
    assert.ok(result.level > 0);
  });

  it('downmixes stereo and resamples 48 kHz float32 to 16 kHz mono', () => {
    const converter = new PcmConverter(16000);
    const mono = new Int16Array(48000);
    for (let i = 0; i < mono.length; i++) {
      mono[i] = Math.round(10000 * Math.sin((2 * Math.PI * 440 * i) / 48000));
    }

    const total = { samples: 0, level: 0 };
    for (const part of chunk(mono, 1600)) {
      const block = {
        data: toInterleavedFloat32(part, 2),
        encoding: 'float32' as const,
        sampleRate: 48000,
        channels: 2,
      };
      const result = converter.process(block);
      total.samples += result.samples.length;
      total.level = result.level;
    }

    assert.equal(total.samples, 16000, 'one second at 48 kHz must stay one second');
    assert.ok(total.level > 0.1, 'a 440 Hz tone at ~0.3 amplitude should register level');
  });

  it('starts a fresh resampler if the device changes rate mid-stream', () => {
    const converter = new PcmConverter(16000);
    const first = converter.process({
      data: new Float32Array(1600).fill(0.5).buffer,
      encoding: 'float32',
      sampleRate: 48000,
      channels: 1,
    });
    const second = converter.process({
      data: new Float32Array(1600).fill(0.5).buffer,
      encoding: 'float32',
      sampleRate: 16000,
      channels: 1,
    });

    assert.equal(second.samples.length, 1600, 'the new rate is delivered as-is');
    for (const value of second.samples) assert.equal(value, 16384);
    assert.ok(first.samples.length > 0);
  });
});

function chunkFloat(samples: Float32Array, size: number): Float32Array[] {
  const out: Float32Array[] = [];
  for (let offset = 0; offset < samples.length; offset += size) {
    out.push(samples.subarray(offset, Math.min(offset + size, samples.length)));
  }
  return out;
}
