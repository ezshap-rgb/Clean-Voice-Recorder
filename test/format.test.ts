import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  describeSettings,
  estimatedBytesPerHour,
  formatBytes,
  formatClock,
  formatDateTime,
  formatDuration,
} from '../src/core/format';

describe('formatClock', () => {
  it('pads minutes and seconds', () => {
    assert.equal(formatClock(0), '00:00');
    assert.equal(formatClock(7), '00:07');
    assert.equal(formatClock(67), '01:07');
    assert.equal(formatClock(3599), '59:59');
  });

  it('adds hours only when needed', () => {
    assert.equal(formatClock(3600), '1:00:00');
    assert.equal(formatClock(3723), '1:02:03');
  });

  it('clamps negatives to zero', () => {
    assert.equal(formatClock(-5), '00:00');
  });
});

describe('formatDuration', () => {
  it('omits the hour part until an hour has elapsed', () => {
    assert.equal(formatDuration(0), '0:00');
    assert.equal(formatDuration(7), '0:07');
    assert.equal(formatDuration(67), '1:07');
    assert.equal(formatDuration(3723), '1:02:03');
  });
});

describe('formatBytes', () => {
  it('scales through B, KB, MB and GB', () => {
    assert.equal(formatBytes(0), '0 B');
    assert.equal(formatBytes(840), '840 B');
    assert.equal(formatBytes(1024), '1 KB');
    assert.equal(formatBytes(312 * 1024), '312 KB');
    assert.equal(formatBytes(7_200_000), '6.9 MB');
    assert.equal(formatBytes(1.4 * 1024 * 1024 * 1024), '1.4 GB');
  });

  it('handles nonsense input', () => {
    assert.equal(formatBytes(-1), '—');
    assert.equal(formatBytes(Number.NaN), '—');
  });
});

describe('formatDateTime', () => {
  it('formats a timestamp readably', () => {
    assert.equal(formatDateTime(new Date(2026, 9, 15, 14, 32).getTime()), '15 Oct 2026, 14:32');
  });

  it('returns empty for missing timestamps', () => {
    assert.equal(formatDateTime(0), '');
    assert.equal(formatDateTime(Number.NaN), '');
  });
});

describe('estimatedBytesPerHour', () => {
  it('follows the mp3 bitrate', () => {
    assert.equal(estimatedBytesPerHour({ bitrate: 16, format: 'mp3' }), 7_200_000);
    assert.equal(estimatedBytesPerHour({ bitrate: 32, format: 'mp3' }), 14_400_000);
    assert.equal(estimatedBytesPerHour({ bitrate: 64, format: 'mp3' }), 28_800_000);
  });

  it('is far larger for uncompressed wav, and independent of the bitrate', () => {
    const wavHour = estimatedBytesPerHour({ bitrate: 16, format: 'wav' });
    assert.equal(wavHour, 115_200_000);
    assert.equal(
      estimatedBytesPerHour({ bitrate: 64, format: 'wav' }),
      wavHour,
      'a bitrate setting does not apply to PCM'
    );
  });
});

describe('describeSettings', () => {
  it('describes the active configuration', () => {
    assert.equal(describeSettings({ bitrate: 16, format: 'mp3' }), '16 kHz mono, 16 kbps MP3');
    assert.equal(describeSettings({ bitrate: 64, format: 'wav' }), '16 kHz mono, uncompressed 16-bit PCM');
  });
});
