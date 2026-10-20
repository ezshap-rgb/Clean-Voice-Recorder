import path from 'node:path';
import type { Mp3EncoderFactory, Mp3EncoderInstance } from '../../src/core/mp3';

type LamejsModule = {
  Mp3Encoder: new (channels: number, sampleRate: number, kbps: number) => Mp3EncoderInstance;
};

/**
 * Bind the *real* LAME encoder for tests.
 *
 * It is loaded by absolute path rather than by package name because the package
 * exposes a `require` build that never sets `module.exports` (so `require()` by
 * name yields `{}`) and its `exports` map hides the ESM build from subpath
 * resolution. Node can require the ESM file directly (Node >= 22.12).
 */
export function loadLamejs(): Mp3EncoderFactory {
  const buildPath = path.resolve(
    process.cwd(),
    'node_modules/@breezystack/lamejs/dist/lamejs.js'
  );

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const lamejs = require(buildPath) as LamejsModule;

  if (typeof lamejs.Mp3Encoder !== 'function') {
    throw new Error(`lamejs ESM build at ${buildPath} did not export Mp3Encoder`);
  }

  return (channels: number, sampleRate: number, kbps: number) =>
    new lamejs.Mp3Encoder(channels, sampleRate, kbps);
}
