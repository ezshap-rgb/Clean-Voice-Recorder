/**
 * Persisted preferences.
 *
 * Stored as JSON on disk plus WAV, which keeps them in the app's own storage
 * without pulling in another native dependency.
 */
import { DEFAULT_SETTINGS, isBitrate, isFormat, type Settings } from './types';

export const SETTINGS_FILE_NAME = 'settings.json';

/** Minimal storage seam so settings can be tested without a filesystem. */
export interface SettingsStore {
  readText(): string | null;
  writeText(value: string): void;
}

/**
 * Parse stored settings, falling back to defaults for anything missing or
 * invalid. Never throws: a corrupted file should not stop the app launching.
 */
export function parseSettings(raw: string | null | undefined): Settings {
  if (!raw) return { ...DEFAULT_SETTINGS };

  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return { ...DEFAULT_SETTINGS };

    const record = parsed as Record<string, unknown>;
    return {
      bitrate: isBitrate(record.bitrate) ? record.bitrate : DEFAULT_SETTINGS.bitrate,
      format: isFormat(record.format) ? record.format : DEFAULT_SETTINGS.format,
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function serializeSettings(settings: Settings): string {
  return JSON.stringify(
    { bitrate: settings.bitrate, format: settings.format },
    null,
    2
  );
}

export function loadSettings(store: SettingsStore): Settings {
  try {
    return parseSettings(store.readText());
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(store: SettingsStore, settings: Settings): void {
  store.writeText(serializeSettings(settings));
}
