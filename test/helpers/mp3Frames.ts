/**
 * A small, independent MPEG audio frame parser.
 *
 * Written from the bitstream layout rather than reusing any project code, so it
 * genuinely validates what the encoder produced.
 */

export type Mp3Frame = {
  offset: number;
  version: '1' | '2' | '2.5';
  layer: 1 | 2 | 3;
  bitrateKbps: number;
  sampleRate: number;
  channelMode: 'stereo' | 'jointStereo' | 'dualMono' | 'mono';
  protectedByCrc: boolean;
  /** Total bytes in this frame, including padding. */
  frameBytes: number;
};

/** Index 0 means "free format" and 15 is invalid; both are rejected here. */
const BITRATES_V1_LAYER3 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, -1];
const BITRATES_V2_LAYER3 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, -1];

const SAMPLE_RATES: Record<Mp3Frame['version'], number[]> = {
  '1': [44100, 48000, 32000],
  '2': [22050, 24000, 16000],
  '2.5': [11025, 12000, 8000],
};

export function firstFrameOffset(bytes: Uint8Array): number {
  for (let i = 0; i + 4 <= bytes.length; i++) {
    if (bytes[i] === 0xff && (bytes[i + 1] & 0xe0) === 0xe0) return i;
  }
  return -1;
}

export function parseFrameAt(bytes: Uint8Array, offset: number): Mp3Frame {
  const b0 = bytes[offset];
  const b1 = bytes[offset + 1];
  const b2 = bytes[offset + 2];
  const b3 = bytes[offset + 3];

  if (b0 !== 0xff || (b1 & 0xe0) !== 0xe0) {
    throw new Error(`No MPEG frame sync at byte ${offset}`);
  }

  const versionBits = (b1 >> 3) & 0b11;
  const layerBits = (b1 >> 1) & 0b11;
  const protectedByCrc = (b1 & 0b1) === 0;

  if (versionBits === 1) throw new Error('Reserved MPEG version');
  const version: Mp3Frame['version'] = versionBits === 0 ? '2.5' : versionBits === 2 ? '2' : '1';

  if (layerBits === 0) throw new Error('Reserved layer');
  const layer = (layerBits === 1 ? 3 : layerBits === 2 ? 2 : 1) as Mp3Frame['layer'];

  const bitrateIndex = (b2 >> 4) & 0x0f;
  const sampleRateIndex = (b2 >> 2) & 0b11;
  const padding = (b2 >> 1) & 0b1;

  const table = version === '1' ? BITRATES_V1_LAYER3 : BITRATES_V2_LAYER3;
  const bitrateKbps = table[bitrateIndex];
  if (bitrateKbps <= 0) {
    throw new Error(`Unsupported bitrate index ${bitrateIndex} for MPEG-${version} Layer III`);
  }

  const sampleRate = SAMPLE_RATES[version][sampleRateIndex];
  if (!sampleRate) throw new Error(`Reserved sample rate index ${sampleRateIndex}`);

  const channelBits = (b3 >> 6) & 0b11;
  const channelMode: Mp3Frame['channelMode'] =
    channelBits === 0
      ? 'stereo'
      : channelBits === 1
        ? 'jointStereo'
        : channelBits === 2
          ? 'dualMono'
          : 'mono';

  if (layer !== 3) {
    throw new Error(`Only Layer III is expected, got layer ${layer}`);
  }
  const samplesPerFrame = version === '1' ? 1152 : 576;
  const frameBytes = Math.floor((samplesPerFrame / 8) * (bitrateKbps * 1000) / sampleRate) + padding;

  return {
    offset,
    version,
    layer,
    bitrateKbps,
    sampleRate,
    channelMode,
    protectedByCrc,
    frameBytes,
  };
}

/** Walk every frame in the stream, stopping at the first thing that is not one. */
export function parseFrames(bytes: Uint8Array): Mp3Frame[] {
  const frames: Mp3Frame[] = [];
  let offset = firstFrameOffset(bytes);

  while (offset >= 0 && offset + 4 <= bytes.length) {
    const frame = parseFrameAt(bytes, offset);
    frames.push(frame);
    offset += frame.frameBytes;
    if (offset + 4 > bytes.length) break;
  }

  return frames;
}
