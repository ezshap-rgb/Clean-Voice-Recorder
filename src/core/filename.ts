/**
 * Recording file naming: a date/time stamp by default, plus sanitisation and
 * collision handling for names the user types.
 */
import { FORMATS, type RecordingFormat } from './types';

/** Longest name we will produce, leaving room for a dedupe suffix and extension. */
const MAX_BASE_LENGTH = 80;

/** Characters that are illegal in Android/iOS file names, plus control characters. */
const ILLEGAL = /[\\/:*?"<>|\u0000-\u001f\u007f]/g;

function pad(value: number, width = 2): string {
  return String(value).padStart(width, '0');
}

/**
 * Default name for a recording: the local date and time it started.
 * Colons are replaced with dashes because they are illegal in file names.
 *
 * @example "2026-10-15 14-32-07"
 */
export function defaultRecordingName(date: Date = new Date()): string {
  const ymd = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const hms = `${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`;
  return `${ymd} ${hms}`;
}

/**
 * Make a user-supplied name safe to use as a file name. Returns an empty string
 * when nothing usable remains, so callers can fall back to the default.
 */
export function sanitizeFileName(input: string): string {
  // Path separators are already illegal characters, so a path-like input such as
  // "../../etc/passwd" turns into ".. .. etc passwd". Strip the resulting run of
  // leading dots and spaces so it cannot hide the file or look like traversal.
  const cleaned = input
    .replace(ILLEGAL, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[.\s]+/, '')
    // Trailing dots and spaces are rejected by some filesystems.
    .replace(/[.\s]+$/, '')
    .trim();

  return cleaned
    .slice(0, MAX_BASE_LENGTH)
    .replace(/[.\s]+$/, '')
    .trim();
}

/** Strip a trailing audio extension so we can re-apply the correct one. */
export function stripAudioExtension(name: string): string {
  const pattern = new RegExp(`\\.(${FORMATS.join('|')})$`, 'i');
  return name.replace(pattern, '');
}

/**
 * Turn a user-supplied name into a final file name for `format`.
 * Falls back to `fallbackBase` when the name has no usable characters.
 */
export function toFileName(
  input: string,
  format: RecordingFormat,
  fallbackBase: string = defaultRecordingName()
): string {
  const base = sanitizeFileName(stripAudioExtension(input)) || fallbackBase;
  return `${base}.${format}`;
}

/**
 * Pick a name that is not already in use, appending " (2)", " (3)" and so on.
 * `isTaken` receives a candidate name including its extension.
 */
export function uniqueFileName(
  fileName: string,
  extension: string,
  isTaken: (candidate: string) => boolean
): string {
  if (!isTaken(fileName)) return fileName;

  const base = stripAudioExtension(fileName);
  const suffix = `.${extension}`;
  for (let n = 2; n < 1000; n++) {
    const candidate = `${base} (${n})${suffix}`;
    if (!isTaken(candidate)) return candidate;
  }
  // Extremely unlikely; fall back to a timestamped name.
  return `${base} ${Date.now()}${suffix}`;
}

/** Split a file name into a base name and extension (extension includes the dot). */
export function splitExtension(fileName: string): { base: string; extension: string } {
  const index = fileName.lastIndexOf('.');
  if (index <= 0) return { base: fileName, extension: '' };
  return { base: fileName.slice(0, index), extension: fileName.slice(index) };
}
