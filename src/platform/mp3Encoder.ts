/**
 * Binds the real LAME encoder to the audio core.
 *
 * Note the Metro configuration in `metro.config.js`: this package's `main` entry
 * is an IIFE bundle that never assigns `module.exports`, so the bundler is
 * pointed at the ESM build instead. Without that, the named import below would
 * resolve to `undefined` at runtime.
 */
import { Mp3Encoder } from '@breezystack/lamejs';
import type { Mp3EncoderFactory, Mp3EncoderInstance } from '../core/mp3';

export const createMp3Encoder = (
  channels: number,
  sampleRate: number,
  bitrateKbps: number
): Mp3EncoderInstance => new Mp3Encoder(channels, sampleRate, bitrateKbps);

export type { Mp3EncoderFactory, Mp3EncoderInstance };

