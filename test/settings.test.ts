import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  loadSettings,
  parseSettings,
  saveSettings,
  serializeSettings,
  type SettingsStore,
} from '../src/core/settings';
import { DEFAULT_SETTINGS } from '../src/core/types';

function fakeStore(initial: string | null = null): SettingsStore & { value: string | null } {
  return {
    value: initial,
    readText() {
      return this.value;
    },
    writeText(value: string) {
      this.value = value;
    },
  };
}

describe('parseSettings', () => {
  it('defaults to 16 kbps MP3 when nothing is stored', () => {
    assert.deepEqual(parseSettings(null), { bitrate: 16, format: 'mp3' });
    assert.deepEqual(parseSettings(undefined), { bitrate: 16, format: 'mp3' });
    assert.deepEqual(parseSettings(''), { bitrate: 16, format: 'mp3' });
    assert.deepEqual(DEFAULT_SETTINGS, { bitrate: 16, format: 'mp3' });
  });

  it('reads stored values', () => {
    assert.deepEqual(parseSettings('{"bitrate":64,"format":"wav"}'), {
      bitrate: 64,
      format: 'wav',
    });
  });

  it('falls back per field rather than discarding everything', () => {
    assert.deepEqual(parseSettings('{"bitrate":32}'), { bitrate: 32, format: 'mp3' });
    assert.deepEqual(parseSettings('{"format":"wav"}'), { bitrate: 16, format: 'wav' });
  });

  it('rejects unsupported bitrates and formats', () => {
    assert.deepEqual(parseSettings('{"bitrate":128,"format":"ogg"}'), DEFAULT_SETTINGS);
    assert.deepEqual(parseSettings('{"bitrate":"16","format":true}'), DEFAULT_SETTINGS);
    assert.deepEqual(parseSettings('{"bitrate":0,"format":"mp3"}'), DEFAULT_SETTINGS);
  });

  it('survives corrupt or unexpected JSON', () => {
    assert.deepEqual(parseSettings('not json at all'), DEFAULT_SETTINGS);
    assert.deepEqual(parseSettings('null'), DEFAULT_SETTINGS);
    assert.deepEqual(parseSettings('[1,2,3]'), DEFAULT_SETTINGS);
    assert.deepEqual(parseSettings('"a string"'), DEFAULT_SETTINGS);
  });
});

describe('settings persistence', () => {
  it('round-trips through the store', () => {
    const store = fakeStore();
    saveSettings(store, { bitrate: 64, format: 'wav' });
    assert.deepEqual(loadSettings(store), { bitrate: 64, format: 'wav' });
  });

  it('writes readable JSON', () => {
    assert.equal(serializeSettings({ bitrate: 32, format: 'mp3' }), '{\n  "bitrate": 32,\n  "format": "mp3"\n}');
  });

  it('falls back to defaults when the store throws', () => {
    const store: SettingsStore = {
      readText() {
        throw new Error('disk unavailable');
      },
      writeText() {},
    };
    assert.deepEqual(loadSettings(store), DEFAULT_SETTINGS);
  });
});
