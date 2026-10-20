import { Alert, NativeModules, Platform } from 'react-native';
import * as FileSystemLegacy from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import type { RecordingEntry } from '../storage/recordings';

const { BatchShare } = NativeModules;

/**
 * Share multiple recordings at once using Android's native ACTION_SEND_MULTIPLE chooser.
 */
export async function batchShareRecordings(entries: RecordingEntry[]): Promise<boolean> {
  if (entries.length === 0) return false;

  const uris = entries.map((e) => e.uri);
  const mimeType = entries.every((e) => e.format === 'wav') ? 'audio/wav' : 'audio/*';

  if (BatchShare?.shareMultiple) {
    try {
      await BatchShare.shareMultiple(
        uris,
        mimeType,
        entries.length === 1 ? `Share ${entries[0].name}` : `Share ${entries.length} Recordings`
      );
      return true;
    } catch (err) {
      console.warn('BatchShare.shareMultiple failed, falling back:', err);
    }
  }

  // Fallback for single file or if native module not ready
  if (entries.length === 1) {
    await Sharing.shareAsync(entries[0].uri, {
      mimeType: entries[0].format === 'wav' ? 'audio/wav' : 'audio/mpeg',
      dialogTitle: `Share ${entries[0].name}`,
    });
    return true;
  }

  // If multiple and no native multi-share, sequentially share or notify
  Alert.alert(
    'Batch Share',
    `Sharing ${entries.length} recordings one by one. You will see a share prompt for each.`
  );
  for (const entry of entries) {
    await Sharing.shareAsync(entry.uri, {
      mimeType: entry.format === 'wav' ? 'audio/wav' : 'audio/mpeg',
      dialogTitle: `Share ${entry.name}`,
    });
  }
  return true;
}

/**
 * Exports recordings directly to a user-selected folder (Downloads, Music, Documents, etc.)
 * using Android's Storage Access Framework.
 *
 * Once saved there, files are permanently accessible in the device Files app
 * and over USB cable to a PC.
 */
export async function exportRecordingsToFolder(
  entries: RecordingEntry[]
): Promise<{ success: boolean; count: number; error?: string }> {
  if (entries.length === 0) return { success: false, count: 0 };

  if (Platform.OS !== 'android') {
    return { success: false, count: 0, error: 'Folder export is supported on Android.' };
  }

  try {
    const permissions =
      await FileSystemLegacy.StorageAccessFramework.requestDirectoryPermissionsAsync();
    if (!permissions.granted) {
      return { success: false, count: 0, error: 'Permission was not granted.' };
    }

    const uris = entries.map((e) => e.uri);

    // Fast native streaming copy via BatchShareModule
    if (BatchShare?.exportToDirectory) {
      const count = await BatchShare.exportToDirectory(uris, permissions.directoryUri);
      return { success: true, count };
    }

    // Fallback: Copy via StorageAccessFramework write
    let count = 0;
    for (const entry of entries) {
      const mime = entry.format === 'wav' ? 'audio/wav' : 'audio/mpeg';
      const cleanName = entry.name.replace(/\.(mp3|wav)$/i, '');
      const newSafUri = await FileSystemLegacy.StorageAccessFramework.createFileAsync(
        permissions.directoryUri,
        cleanName,
        mime
      );
      const data = await FileSystemLegacy.readAsStringAsync(entry.uri, {
        encoding: FileSystemLegacy.EncodingType.Base64,
      });
      await FileSystemLegacy.StorageAccessFramework.writeAsStringAsync(newSafUri, data, {
        encoding: FileSystemLegacy.EncodingType.Base64,
      });
      count++;
    }

    return { success: true, count };
  } catch (err: any) {
    console.warn('Folder export failed:', err);
    return { success: false, count: 0, error: err?.message || 'Export failed' };
  }
}
