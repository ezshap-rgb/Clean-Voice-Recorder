/**
 * Shared domain types and constants for the recorder.
 *
 * Everything in `src/core` is deliberately free of React Native imports so it can
 * be compiled and unit-tested in plain Node (see `tools/test.mjs`).
 */

/** Compression bitrates offered in Settings, in kbps. */
export const BITRATES = [16, 32, 64] as const;
export type BitrateKbps = (typeof BITRATES)[number];

/** Bitrate used until the user picks another one. */
export const DEFAULT_BITRATE: BitrateKbps = 16;

export const FORMATS = ['mp3', 'wav'] as const;
export type RecordingFormat = (typeof FORMATS)[number];

/** Container used until the user picks another one. */
export const DEFAULT_FORMAT: RecordingFormat = 'mp3';

/**
 * Capture is fixed at mono 16 kHz, which is the sweet spot for lecture speech:
 * - it is a valid MPEG-2 Layer III sample rate, so 16/32/64 kbps all encode natively;
 * - it keeps a PCM (WAV) recording at 32 kB/s instead of the ~176 kB/s of CD audio.
 */
export const CAPTURE_SAMPLE_RATE = 16_000;
export const CAPTURE_CHANNELS = 1;
export const BITS_PER_SAMPLE = 16;

export type Settings = {
  bitrate: BitrateKbps;
  format: RecordingFormat;
};

export const DEFAULT_SETTINGS: Settings = {
  bitrate: DEFAULT_BITRATE,
  format: DEFAULT_FORMAT,
};

export const MIME_TYPES: Record<RecordingFormat, string> = {
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
};

export function isBitrate(value: unknown): value is BitrateKbps {
  return BITRATES.includes(value as BitrateKbps);
}

export function isFormat(value: unknown): value is RecordingFormat {
  return FORMATS.includes(value as RecordingFormat);
}
