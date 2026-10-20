/** Settings persisted as a small JSON file next to the recordings folder. */
import { File, Paths } from 'expo-file-system';
import { SETTINGS_FILE_NAME, type SettingsStore } from '../core/settings';

export function createSettingsStore(): SettingsStore {
  const settingsFile = () => new File(Paths.document, SETTINGS_FILE_NAME);

  return {
    readText(): string | null {
      const file = settingsFile();
      return file.exists ? file.textSync() : null;
    },
    writeText(value: string): void {
      const file = settingsFile();
      if (!file.exists) file.create();
      file.write(value);
    },
  };
}
