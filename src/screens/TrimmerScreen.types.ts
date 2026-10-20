import type { RecordingEntry } from '../storage/recordings';
import type { Settings } from '../core/types';

export interface TrimRegion {
  keepStartSeconds: number;
  keepEndSeconds: number;
}

export interface TrimSaveOutcome {
  entry: RecordingEntry;
  bytes: number;
  durationSeconds: number;
}

export type TrimResult = TrimSaveOutcome;

/**
 * A real Mp3Encoder factory plus the encode/chunk keys the trimmer's JS runtime
 * actually uses. Imported here from the platform encoder so the trimmer UI bundle
 * never imports the native audio package: the trimmer opens, previews and paints
 * its waveforms without throttling any task, and mp3.js stay the render stage.
 */

