import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildWavHeader, WAV_HEADER_BYTES, WavSink } from '../src/core/wav';
import { MemoryFileWriter } from './helpers/memoryWriter';
import { chunk, int16ToArrayBuffer, toneInt16 } from './helpers/signals';

const FORMAT = { sampleRate: 16000, channels: 1, bitsPerSample: 16 };

/** Independent RIFF reader, so the assertions do not reuse the writer's logic. */
function parseWav(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const ascii = (offset: number, length: number) =>
    String.fromCharCode(...bytes.subarray(offset, offset + length));

  return {
    riff: ascii(0, 4),
    riffSize: view.getUint32(4, true),
    wave: ascii(8, 4),
    fmtTag: ascii(12, 4),
    fmtSize: view.getUint32(16, true),
    audioFormat: view.getUint16(20, true),
    channels: view.getUint16(22, true),
    sampleRate: view.getUint32(24, true),
    byteRate: view.getUint32(28, true),
    blockAlign: view.getUint16(32, true),
    bitsPerSample: view.getUint16(34, true),
    dataTag: ascii(36, 4),
    dataSize: view.getUint32(40, true),
  };
}

describe('buildWavHeader', () => {
  it('describes 16 kHz mono 16-bit PCM', () => {
    const header = buildWavHeader(32000, FORMAT);
    assert.equal(header.length, WAV_HEADER_BYTES);

    const wav = parseWav(header);
    assert.equal(wav.riff, 'RIFF');
    assert.equal(wav.wave, 'WAVE');
    assert.equal(wav.fmtTag, 'fmt ');
    assert.equal(wav.dataTag, 'data');
    assert.equal(wav.fmtSize, 16);
    assert.equal(wav.audioFormat, 1, 'format tag 1 means uncompressed PCM');
    assert.equal(wav.channels, 1);
    assert.equal(wav.sampleRate, 16000);
    assert.equal(wav.bitsPerSample, 16);
  });

  it('computes block align, byte rate and chunk sizes', () => {
    const wav = parseWav(buildWavHeader(32000, FORMAT));
    assert.equal(wav.blockAlign, 2, 'one mono 16-bit sample is 2 bytes');
    assert.equal(wav.byteRate, 32000, '16 kHz * 2 bytes');
    assert.equal(wav.dataSize, 32000);
    assert.equal(wav.riffSize, 32000 + 36, 'RIFF size excludes the first 8 bytes');
  });

  it('reports stereo byte rate correctly', () => {
    const wav = parseWav(buildWavHeader(0, { sampleRate: 16000, channels: 2, bitsPerSample: 16 }));
    assert.equal(wav.channels, 2);
    assert.equal(wav.blockAlign, 4);
    assert.equal(wav.byteRate, 64000);
  });
});

describe('WavSink', () => {
  it('reserves the header, then patches real sizes in on finish', () => {
    const writer = new MemoryFileWriter();
    const sink = new WavSink(writer, FORMAT);

    writer.open();
    sink.begin();

    assert.equal(
      parseWav(writer.contents).dataSize,
      0,
      'sizes are unknown while recording, so the header is reserved with zeros'
    );

    const block = toneInt16(0.1, 16000); // 1600 samples
    sink.write(block);
    sink.write(block);
    sink.finish();

    const expectedDataBytes = block.length * 2 * 2;
    const wav = parseWav(writer.contents);
    assert.equal(wav.dataSize, expectedDataBytes);
    assert.equal(wav.riffSize, expectedDataBytes + 36);
    assert.equal(writer.contents.length, WAV_HEADER_BYTES + expectedDataBytes);
    assert.equal(writer.bytesWritten, WAV_HEADER_BYTES + expectedDataBytes);
  });

  it('writes samples as little-endian 16-bit PCM in order', () => {
    const writer = new MemoryFileWriter();
    const sink = new WavSink(writer, FORMAT);
    writer.open();
    sink.begin();

    const samples = Int16Array.from([0, 1, -1, 32767, -32768, 1234]);
    sink.write(samples);
    sink.finish();

    const payload = writer.contents.subarray(WAV_HEADER_BYTES);
    assert.equal(payload.length, samples.length * 2);

    const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
    const readBack = Array.from({ length: samples.length }, (_, i) => view.getInt16(i * 2, true));
    assert.deepEqual(readBack, Array.from(samples));
  });

  it('ignores empty blocks and keeps the byte count correct', () => {
    const writer = new MemoryFileWriter();
    const sink = new WavSink(writer, FORMAT);
    writer.open();
    sink.begin();
    sink.write(new Int16Array(0));
    assert.equal(writer.bytesWritten, WAV_HEADER_BYTES);

    sink.write(Int16Array.from([7, 7, 7]));
    sink.finish();
    assert.equal(writer.bytesWritten, WAV_HEADER_BYTES + 6);
    assert.equal(parseWav(writer.contents).dataSize, 6);
  });

  it('survives being fed chunked input equivalent to a whole tone', () => {
    const writer = new MemoryFileWriter();
    const sink = new WavSink(writer, FORMAT);
    writer.open();
    sink.begin();

    const total = toneInt16(1, 16000);
    for (const part of chunk(total, 1600)) sink.write(part);
    sink.finish();

    const wav = parseWav(writer.contents);
    assert.equal(wav.dataSize, total.length * 2);

    const payload = writer.contents.subarray(WAV_HEADER_BYTES);
    const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
    const readBack = new Int16Array(total.length);
    for (let i = 0; i < total.length; i++) readBack[i] = view.getInt16(i * 2, true);
    assert.deepEqual(Array.from(readBack), Array.from(total));
  });
});

describe('test signal helper', () => {
  it('produces little-endian identical bytes to the source samples', () => {
    const samples = Int16Array.from([-1, 256, -32768]);
    const bytes = new Uint8Array(int16ToArrayBuffer(samples));
    assert.deepEqual(Array.from(bytes), [0xff, 0xff, 0x00, 0x01, 0x00, 0x80]);
  });
});
