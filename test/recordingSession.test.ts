import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { RecordingSession } from '../src/audio/recordingSession';
import type { PcmBlock } from '../src/core/pcm';
import { CAPTURE_SAMPLE_RATE, DEFAULT_SETTINGS, type Settings } from '../src/core/types';
import { WAV_HEADER_BYTES } from '../src/core/wav';
import { loadLamejs } from './helpers/lamejs';
import { MemoryFileWriter } from './helpers/memoryWriter';
import { firstFrameOffset, parseFrameAt, parseFrames } from './helpers/mp3Frames';
import { chunk, int16ToArrayBuffer, toneInt16, toInterleavedFloat32 } from './helpers/signals';

const createEncoder = loadLamejs();

function int16Block(samples: Int16Array): PcmBlock {
  return {
    data: int16ToArrayBuffer(samples),
    encoding: 'int16',
    sampleRate: CAPTURE_SAMPLE_RATE,
    channels: 1,
  };
}

/** Record `seconds` of a tone, feeding 100 ms blocks as the microphone would. */
function record(settings: Settings, seconds: number, blockSize = 1600) {
  const writer = new MemoryFileWriter();
  const session = new RecordingSession({ settings, writer, createEncoder });
  session.begin();

  const tone = toneInt16(seconds, CAPTURE_SAMPLE_RATE);
  const blocks = chunk(tone, blockSize);
  for (const block of blocks) session.handleBlock(int16Block(block));

  const outcome = session.finish();
  return { writer, session, outcome, blocks };
}

function wavDataSize(bytes: Uint8Array): number {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return view.getUint32(40, true);
}

describe('RecordingSession with the default settings (16 kbps MP3)', () => {
  it('produces a valid MP3 at 16 kbps', () => {
    assert.deepEqual(DEFAULT_SETTINGS, { bitrate: 16, format: 'mp3' });

    const { writer, outcome } = record(DEFAULT_SETTINGS, 2);
    assert.ok(writer.contents.length > 0);

    const frame = parseFrameAt(writer.contents, firstFrameOffset(writer.contents));
    assert.equal(frame.bitrateKbps, 16);
    assert.equal(frame.sampleRate, 16000);
    assert.equal(frame.channelMode, 'mono');

    assert.ok(
      Math.abs(outcome.durationSeconds - 2) < 0.001,
      `expected 2s, got ${outcome.durationSeconds}`
    );
    assert.equal(outcome.sampleRate, 16000);
    assert.equal(outcome.bytes, writer.contents.length);
  });

  it('honours each selectable bitrate', () => {
    for (const bitrate of [16, 32, 64] as const) {
      const { writer } = record({ bitrate, format: 'mp3' }, 1);
      const frames = parseFrames(writer.contents);
      assert.ok(frames.length > 0, `${bitrate} kbps produced no frames`);

      const bitrates = new Set(frames.map((f) => f.bitrateKbps));
      assert.deepEqual([...bitrates], [bitrate]);
    }
  });

  it('scales file size with the selected bitrate', () => {
    const low = record({ bitrate: 16, format: 'mp3' }, 3).writer.contents.length;
    const high = record({ bitrate: 64, format: 'mp3' }, 3).writer.contents.length;

    // 64 kbps is 4x 16 kbps, so the files should differ by roughly that factor.
    const ratio = high / low;
    assert.ok(ratio > 3.7 && ratio < 4.3, `expected ~4x, got ${ratio.toFixed(2)}x`);
  });
});

describe('RecordingSession with WAV', () => {
  it('writes a playable WAV with the exact sample count in the header', () => {
    const { writer, outcome } = record({ bitrate: 16, format: 'wav' }, 2);

    const expectedDataBytes = 2 * CAPTURE_SAMPLE_RATE * 2; // seconds * samples/s * bytes/sample
    assert.equal(wavDataSize(writer.contents), expectedDataBytes);
    assert.equal(writer.contents.length, WAV_HEADER_BYTES + expectedDataBytes);
    assert.equal(outcome.bytes, WAV_HEADER_BYTES + expectedDataBytes);
    assert.ok(Math.abs(outcome.durationSeconds - 2) < 0.001);
  });

  it('records the same audio regardless of the bitrate setting', () => {
    const a = record({ bitrate: 16, format: 'wav' }, 1).writer.contents;
    const b = record({ bitrate: 64, format: 'wav' }, 1).writer.contents;
    assert.deepEqual(Array.from(a), Array.from(b));
  });

  it('downmixes and resamples 48 kHz stereo microphone audio', () => {
    const writer = new MemoryFileWriter();
    const session = new RecordingSession({
      settings: { bitrate: 16, format: 'wav' },
      writer,
      createEncoder,
    });
    session.begin();

    const tone = toneInt16(1, 48000);
    for (const part of chunk(tone, 4800)) {
      session.handleBlock({
        data: toInterleavedFloat32(part, 2),
        encoding: 'float32',
        sampleRate: 48000,
        channels: 2,
      });
    }
    const outcome = session.finish();

    // One second in must be one second out, at the capture rate.
    assert.ok(Math.abs(outcome.durationSeconds - 1) < 0.002);
    assert.equal(wavDataSize(writer.contents), Math.round(outcome.durationSeconds * 16000) * 2);
  });
});

describe('RecordingSession lifecycle', () => {
  it('ignores microphone blocks delivered before begin()', () => {
    const writer = new MemoryFileWriter();
    const session = new RecordingSession({
      settings: DEFAULT_SETTINGS,
      writer,
      createEncoder,
    });

    session.handleBlock(int16Block(toneInt16(0.1, CAPTURE_SAMPLE_RATE)));
    assert.equal(session.durationSeconds, 0);

    session.begin();
    session.handleBlock(int16Block(toneInt16(0.1, CAPTURE_SAMPLE_RATE)));
    const outcome = session.finish();
    assert.ok(Math.abs(outcome.durationSeconds - 0.1) < 0.001);
  });

  it('ignores blocks delivered after finish()', () => {
    const { session, writer, outcome } = record(DEFAULT_SETTINGS, 1);
    const before = writer.contents.length;

    session.handleBlock(int16Block(toneInt16(0.5, CAPTURE_SAMPLE_RATE)));
    assert.equal(writer.contents.length, before);
    assert.equal(session.durationSeconds, outcome.durationSeconds);
  });

  it('is safe to finish twice', () => {
    const writer = new MemoryFileWriter();
    const session = new RecordingSession({
      settings: DEFAULT_SETTINGS,
      writer,
      createEncoder,
    });
    session.begin();
    session.handleBlock(int16Block(toneInt16(0.2, CAPTURE_SAMPLE_RATE)));

    const first = session.finish();
    const sizeAfterFirst = writer.contents.length;
    const second = session.finish();

    assert.deepEqual(second, first);
    assert.equal(writer.contents.length, sizeAfterFirst);
  });

  it('refuses to begin twice', () => {
    const writer = new MemoryFileWriter();
    const session = new RecordingSession({
      settings: DEFAULT_SETTINGS,
      writer,
      createEncoder,
    });
    session.begin();
    assert.throws(() => session.begin(), /already started/);
    session.finish();
  });

  it('reports level and peak from the incoming audio', () => {
    const writer = new MemoryFileWriter();
    const session = new RecordingSession({
      settings: DEFAULT_SETTINGS,
      writer,
      createEncoder,
    });
    session.begin();

    session.handleBlock(int16Block(new Int16Array(1600))); // silence
    assert.equal(session.level, 0);
    assert.equal(session.peak, 0);

    const loud = new Int16Array(1600).fill(16384); // 0.5 full scale
    session.handleBlock(int16Block(loud));
    assert.ok(Math.abs(session.level - 0.5) < 1e-3, `level was ${session.level}`);
    assert.ok(Math.abs(session.peak - 0.5) < 1e-3);

    session.handleBlock(int16Block(new Int16Array(1600)));
    assert.equal(session.level, 0, 'level tracks the latest block');
    assert.ok(session.peak > 0.4, 'peak holds the loudest moment');

    session.finish();
  });

  it('handles an empty recording without producing a corrupt file', () => {
    const writer = new MemoryFileWriter();
    const session = new RecordingSession({
      settings: { bitrate: 16, format: 'wav' },
      writer,
      createEncoder,
    });
    session.begin();
    const outcome = session.finish();

    assert.equal(outcome.durationSeconds, 0);
    assert.equal(outcome.bytes, WAV_HEADER_BYTES);
    assert.equal(wavDataSize(writer.contents), 0);
  });
});
