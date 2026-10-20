import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Mp3Sink } from '../src/core/mp3';
import { CAPTURE_SAMPLE_RATE } from '../src/core/types';
import { loadLamejs } from './helpers/lamejs';
import { MemoryFileWriter } from './helpers/memoryWriter';
import { firstFrameOffset, parseFrameAt, parseFrames } from './helpers/mp3Frames';
import { toneInt16 } from './helpers/signals';

const createEncoder = loadLamejs();

function encodeTone(bitrateKbps: number, seconds: number): Uint8Array {
  const writer = new MemoryFileWriter();
  const sink = new Mp3Sink(writer, CAPTURE_SAMPLE_RATE, bitrateKbps, createEncoder);

  writer.open();
  sink.begin();
  sink.write(toneInt16(seconds, CAPTURE_SAMPLE_RATE));
  sink.finish();

  return writer.contents;
}

describe('Mp3Sink', () => {
  it('produces real MPEG frames at the requested bitrate', () => {
    for (const bitrateKbps of [16, 32, 64]) {
      const bytes = encodeTone(bitrateKbps, 1);
      assert.ok(bytes.length > 0, `${bitrateKbps} kbps produced no output`);

      const offset = firstFrameOffset(bytes);
      assert.notEqual(offset, -1, `${bitrateKbps} kbps output has no MPEG frame sync`);

      const frame = parseFrameAt(bytes, offset);
      assert.equal(frame.bitrateKbps, bitrateKbps, 'requested bitrate must reach the encoder');
      assert.equal(frame.sampleRate, CAPTURE_SAMPLE_RATE);
      assert.equal(frame.channelMode, 'mono');
      assert.equal(frame.layer, 3);
      // 16 kHz is an MPEG-2 rate, so low-bitrate frames use the MPEG-2 tables.
      assert.equal(frame.version, '2');
    }
  });

  it('keeps every frame at the chosen bitrate', () => {
    const bytes = encodeTone(16, 2);
    const frames = parseFrames(bytes);

    // Two seconds at 576 samples/frame is ~56 frames, plus the initial info frame.
    assert.ok(frames.length >= 50, `expected ~56 frames, parsed ${frames.length}`);

    const bitrates = new Set(frames.map((frame) => frame.bitrateKbps));
    assert.deepEqual([...bitrates], [16]);

    const rates = new Set(frames.map((frame) => frame.sampleRate));
    assert.deepEqual([...rates], [16000]);

    const modes = new Set(frames.map((frame) => frame.channelMode));
    assert.deepEqual([...modes], ['mono']);
  });

  it('produces output whose size matches the requested bitrate', () => {
    for (const bitrateKbps of [16, 32, 64]) {
      const bytes = encodeTone(bitrateKbps, 4);
      const expectedBytes = (bitrateKbps * 1000 * 4) / 8;
      const ratio = bytes.length / expectedBytes;

      assert.ok(
        ratio > 0.9 && ratio < 1.15,
        `${bitrateKbps} kbps: ${bytes.length} bytes is ${(ratio * 100).toFixed(1)}% of the ${expectedBytes} expected`
      );
    }
  });

  it('derives frame length from bitrate and sample rate', () => {
    const frame = parseFrames(encodeTone(16, 1))[0];
    // MPEG-2 Layer III carries 576 samples per frame: 576/8 * 16000/16000 = 72 bytes.
    assert.equal(frame.frameBytes, 72);

    const frame64 = parseFrames(encodeTone(64, 1))[0];
    assert.equal(frame64.frameBytes, 288);
  });

  it('re-chunks input so results do not depend on microphone block size', () => {
    const single = encodeTone(16, 1);

    const writer = new MemoryFileWriter();
    const sink = new Mp3Sink(writer, CAPTURE_SAMPLE_RATE, 16, createEncoder);
    writer.open();
    sink.begin();

    // Awkward, non-multiple-of-1152 block sizes, as a real device might produce.
    const samples = toneInt16(1, CAPTURE_SAMPLE_RATE);
    let offset = 0;
    let size = 1000;
    while (offset < samples.length) {
      const take = Math.min(size, samples.length - offset);
      sink.write(samples.subarray(offset, offset + take));
      offset += take;
      size = size === 1000 ? 1600 : 1000;
    }
    sink.finish();

    assert.equal(writer.contents.length, single.length);
  });
});
