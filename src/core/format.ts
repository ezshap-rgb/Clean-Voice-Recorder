/** Display formatting helpers shared by the recording and library screens. */
import { BITS_PER_SAMPLE, CAPTURE_SAMPLE_RATE, type Settings } from './types';

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/** `7:04` or `1:02:03` — matches the clock style used on the record screen. */
export function formatDuration(totalSeconds: number): string {
  const total = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;

  if (hours > 0) return `${hours}:${pad(minutes)}:${pad(seconds)}`;
  return `${minutes}:${pad(seconds)}`;
}

/** `00:07`, `12:34`, `1:02:03` — the padded clock used for the record timer. */
export function formatClock(totalSeconds: number): string {
  const total = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;

  if (hours > 0) return `${hours}:${pad(minutes)}:${pad(seconds)}`;
  return `${pad(minutes)}:${pad(seconds)}`;
}

/** `840 B`, `312 KB`, `7.2 MB`, `1.4 GB`. */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  if (bytes < 1024) return `${Math.round(bytes)} B`;

  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.round(kb)} KB`;

  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;

  return `${(mb / 1024).toFixed(1)} GB`;
}

/** `15 Oct 2026, 14:32`. Formatted manually so it works the same on Hermes. */
export function formatDateTime(epochMs: number): string {
  if (!Number.isFinite(epochMs) || epochMs <= 0) return '';
  const date = new Date(epochMs);
  const day = date.getDate();
  const month = MONTHS[date.getMonth()];
  const time = `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  return `${day} ${month} ${date.getFullYear()}, ${time}`;
}

/**
 * Rough size of one hour of audio with these settings, used to make the bitrate
 * and format choices concrete in the settings sheet.
 */
export function estimatedBytesPerHour(settings: Settings): number {
  if (settings.format === 'mp3') {
    return Math.round(((settings.bitrate * 1000) / 8) * 3600);
  }
  return CAPTURE_SAMPLE_RATE * (BITS_PER_SAMPLE / 8) * 3600;
}

/** Short explanation of what the two settings mean, shown under the estimate. */
export function describeSettings(settings: Settings): string {
  if (settings.format === 'wav') {
    return `${CAPTURE_SAMPLE_RATE / 1000} kHz mono, uncompressed 16-bit PCM`;
  }
  return `${CAPTURE_SAMPLE_RATE / 1000} kHz mono, ${settings.bitrate} kbps MP3`;
}
