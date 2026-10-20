/**
 * The dedicated recordings folder.
 *
 * Everything the app records lands here automatically, so a recording is safe on
 * disk before the user is ever asked what to call it.
 */
import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { defaultRecordingName, splitExtension, toFileName, uniqueFileName } from '../core/filename';
import { DEFAULT_FORMAT, FORMATS, MIME_TYPES, type RecordingFormat } from '../core/types';

export const RECORDINGS_FOLDER_NAME = 'Recordings';

export type RecordingEntry = {
  name: string;
  uri: string;
  sizeBytes: number;
  createdAtMs: number;
  format: RecordingFormat | null;
};

/** The folder recordings are stored in. It may not exist yet. */
export function recordingsDirectory(): Directory {
  return new Directory(Paths.document, RECORDINGS_FOLDER_NAME);
}

/** The folder recordings are stored in, created if necessary. */
export function ensureRecordingsDirectory(): Directory {
  const directory = recordingsDirectory();
  if (!directory.exists) directory.create({ intermediates: true });
  return directory;
}

function formatFromFileName(name: string): RecordingFormat | null {
  const match = name.toLowerCase().match(/\.(mp3|wav)$/);
  if (!match) return null;
  const candidate = match[1] as RecordingFormat;
  return FORMATS.includes(candidate) ? candidate : null;
}

function toEntry(file: File): RecordingEntry {
  return {
    name: file.name,
    uri: file.uri,
    sizeBytes: typeof file.size === 'number' ? file.size : 0,
    createdAtMs: file.creationTime ?? file.modificationTime ?? 0,
    format: formatFromFileName(file.name),
  };
}

/** Every recording in the folder, newest first. */
export function listRecordings(): RecordingEntry[] {
  const directory = recordingsDirectory();
  if (!directory.exists) return [];

  return directory
    .list()
    .filter((item): item is File => item instanceof File)
    .filter((file) => formatFromFileName(file.name) !== null)
    .map(toEntry)
    .sort((a, b) => b.createdAtMs - a.createdAtMs);
}

/**
 * Choose a file for a new recording, named with the date and time by default and
 * made unique so two recordings in the same second cannot collide.
 */
export function createRecordingFile(
  format: RecordingFormat,
  baseName: string = defaultRecordingName()
): File {
  const directory = ensureRecordingsDirectory();
  const desired = toFileName(baseName, format, baseName);
  const name = uniqueFileName(desired, format, (candidate) => new File(directory, candidate).exists);
  return new File(directory, name);
}

/** Rename a recording to a user-supplied name, keeping its format's extension. */
export function renameRecording(entry: RecordingEntry, requestedName: string): RecordingEntry {
  const format = entry.format ?? DEFAULT_FORMAT;
  const directory = ensureRecordingsDirectory();
  const file = new File(entry.uri);

  // Reuse the existing name as the fallback so clearing the field is harmless.
  const desired = toFileName(requestedName, format, splitExtension(entry.name).base);
  const target = uniqueFileName(desired, format, (candidate) => {
    if (candidate === entry.name) return false;
    return new File(directory, candidate).exists;
  });

  if (target === entry.name) return entry;

  file.rename(target);
  return { ...entry, name: target, uri: file.uri };
}

export function deleteRecording(entry: RecordingEntry): void {
  const file = new File(entry.uri);
  if (file.exists) file.delete();
}

/** Hand a recording to the system share sheet. */
export async function shareRecording(entry: RecordingEntry): Promise<void> {
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('Sharing is not available on this device.');
  }

  const format = entry.format ?? DEFAULT_FORMAT;
  await Sharing.shareAsync(entry.uri, {
    mimeType: MIME_TYPES[format],
    dialogTitle: entry.name,
  });
}
