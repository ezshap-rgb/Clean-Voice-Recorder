import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  defaultRecordingName,
  sanitizeFileName,
  splitExtension,
  stripAudioExtension,
  toFileName,
  uniqueFileName,
} from '../src/core/filename';

describe('defaultRecordingName', () => {
  it('stamps local date and time', () => {
    const name = defaultRecordingName(new Date(2026, 9, 15, 14, 32, 7));
    assert.equal(name, '2026-10-15 14-32-07');
  });

  it('zero-pads single-digit components', () => {
    assert.equal(defaultRecordingName(new Date(2026, 0, 5, 9, 3, 4)), '2026-01-05 09-03-04');
  });

  it('contains no characters that are illegal in a file name', () => {
    const name = defaultRecordingName(new Date(2026, 9, 15, 14, 32, 7));
    assert.ok(!/[\\/:*?"<>|]/.test(name));
  });
});

describe('sanitizeFileName', () => {
  it('replaces characters that are illegal on Android and iOS', () => {
    assert.equal(sanitizeFileName('Lecture: 1/2 <intro>?'), 'Lecture 1 2 intro');
  });

  it('collapses whitespace and trims', () => {
    assert.equal(sanitizeFileName('   Physics   101  '), 'Physics 101');
  });

  it('neutralises path-like names that could hide the file or look like traversal', () => {
    // '"/"' is illegal, so a path collapses into words and the leading run of
    // dots and spaces is removed.
    assert.equal(sanitizeFileName('../../etc/passwd'), 'etc passwd');
    assert.equal(sanitizeFileName('...hidden'), 'hidden');
    assert.equal(sanitizeFileName('..'), '');
    assert.equal(sanitizeFileName('.hidden.'), 'hidden');
  });

  it('returns an empty string when nothing usable remains', () => {
    assert.equal(sanitizeFileName('///'), '');
    assert.equal(sanitizeFileName('   '), '');
  });

  it('caps the length', () => {
    assert.equal(sanitizeFileName('a'.repeat(500)).length, 80);
  });

  it('strips control characters', () => {
    assert.equal(sanitizeFileName('Hello\u0000World\u001f'), 'Hello World');
  });
});

describe('stripAudioExtension', () => {
  it('removes only known audio extensions', () => {
    assert.equal(stripAudioExtension('Talk.mp3'), 'Talk');
    assert.equal(stripAudioExtension('Talk.WAV'), 'Talk');
    assert.equal(stripAudioExtension('Talk.txt'), 'Talk.txt');
    assert.equal(stripAudioExtension('Lecture 1.2'), 'Lecture 1.2');
  });
});

describe('splitExtension', () => {
  it('splits name and extension', () => {
    assert.deepEqual(splitExtension('2026-10-15 14-32-07.mp3'), {
      base: '2026-10-15 14-32-07',
      extension: '.mp3',
    });
  });

  it('handles names without an extension or starting with a dot', () => {
    assert.deepEqual(splitExtension('noext'), { base: 'noext', extension: '' });
    assert.deepEqual(splitExtension('.hidden'), { base: '.hidden', extension: '' });
  });
});

describe('toFileName', () => {
  it('appends the extension for the chosen format', () => {
    assert.equal(toFileName('Physics 101', 'mp3'), 'Physics 101.mp3');
    assert.equal(toFileName('Physics 101', 'wav'), 'Physics 101.wav');
  });

  it('replaces a mismatched extension so the name matches the file', () => {
    assert.equal(toFileName('Physics 101.wav', 'mp3'), 'Physics 101.mp3');
    assert.equal(toFileName('Physics 101.MP3', 'wav'), 'Physics 101.wav');
  });

  it('falls back to the timestamp when the name is unusable', () => {
    const fallback = defaultRecordingName(new Date(2026, 9, 15, 14, 32, 7));
    assert.equal(toFileName('///', 'mp3', fallback), '2026-10-15 14-32-07.mp3');
  });
});

describe('uniqueFileName', () => {
  it('returns the name unchanged when it is free', () => {
    assert.equal(uniqueFileName('Talk.mp3', 'mp3', () => false), 'Talk.mp3');
  });

  it('appends an incrementing suffix on collision', () => {
    const taken = new Set(['Talk.mp3', 'Talk (2).mp3']);
    const name = uniqueFileName('Talk.mp3', 'mp3', (candidate) => taken.has(candidate));
    assert.equal(name, 'Talk (3).mp3');
  });
});
