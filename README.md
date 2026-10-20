# Lecture Recorder

A streamlined Android voice recorder for lectures. One big button, a timer and a
level meter — every option lives behind the settings button.

Recordings are saved automatically into a dedicated folder, named with the date
and time, and can be renamed and shared right after recording.

---

## What it does

| Requirement | How it works |
| --- | --- |
| Record at 16 / 32 / 64 kbps, default **16** | Settings sheet → **Bitrate**. `DEFAULT_BITRATE = 16` in [`src/core/types.ts`](src/core/types.ts). Bitrate applies to MP3. |
| Save as WAV or MP3, default **MP3** | Settings sheet → **Format**. `DEFAULT_FORMAT = 'mp3'`. |
| Options hidden behind a settings button | Gear button in the header opens [`SettingsSheet`](src/components/SettingsSheet.tsx). The main screen has no controls other than record/stop. |
| Name the file after recording, default = date/time stamp | After stopping, a dialog asks for a name, pre-filled with e.g. `2026-10-15 14-32-07`. Changing it renames the already-saved file. |
| Option to share after recording | **Save & Share** in that dialog opens the system share sheet. Every recording can also be shared later from the library. |
| Automatically saved to a dedicated local folder | Files land in the app's `Recordings` folder the moment recording starts, before you are asked anything. |
| (Library) | The **Library** tab lists every recording with playback, share, rename and delete. |

Everything the app records is stored at:

```
<app documents directory>/Recordings/
```

---

## Running it

```sh
npm install
npm start          # then press "a" for Android
```

All three native modules used (`expo-audio`, `expo-file-system`, `expo-sharing`)
ship inside Expo Go for SDK 57, and background recording is deliberately left
off, so **Expo Go should be enough** — no development build required. If you
later enable background recording or add native code, you will need a
development build (`npx expo run:android`).

Android only for now: [`app.json`](app.json) has no `ios` section. The Dart-free
JavaScript is platform-neutral, so adding iOS is a config job rather than a
rewrite.

---

## How the audio pipeline works

Neither Expo's recorder nor the Android media APIs can output MP3 or WAV
directly, so both formats are produced from a single raw PCM capture:

```
microphone
   │  expo-audio useAudioStream()          ← raw PCM blocks, ~100 ms, int16
   ▼
PcmConverter                               ← downmix → mono, resample → 16 kHz
   │
   ├─ format = mp3 → Mp3Sink  → LAME (lamejs) → MP3 frames ─┐
   └─ format = wav → WavSink  → 16-bit PCM + RIFF header ───┤
                                                            ▼
                                        FileHandle.writeBytes() streaming append
                                                            ▼
                                            Recordings/<name>.mp3 | .wav
```

Two things make this work at lecture length:

* **Nothing is buffered in memory.** PCM is appended straight to the file as it
  arrives, so a two-hour recording costs the same memory as a two-minute one.
  (An hour of WAV is ~115 MB.)
* **The WAV header is patched, not guessed.** Its size fields are unknown while
  recording, so the header is written with zeros and rewritten at the end.

### Capture profile

Capture is fixed at **mono 16 kHz**, which is the right trade for speech:

* 16 kHz is an MPEG-2 Layer III sample rate, so 16/32/64 kbps all encode
  natively at the exact requested bitrate;
* a WAV recording stays at 32 kB/s rather than CD audio's ~176 kB/s.

The stream reports the rate and channel count it *actually* delivered, and the
converter resamples and downmixes if the device cannot honour the request.

---

## Layout

```
src/core/          pure, dependency-free audio + domain logic (unit tested)
  pcm.ts           PCM decode, downmix, stateful resampler
  mp3.ts           streaming MP3 sink (encoder injected)
  wav.ts           RIFF header + streaming WAV sink
  sink.ts          FileWriter / AudioSink seams
  types.ts         settings model and defaults
  filename.ts      timestamp naming, sanitising, collision handling
  settings.ts      settings parsing/validation
  format.ts        display formatting
src/audio/         recordingSession.ts — PCM in, encoded file out
src/platform/      expo-file-system writer, lamejs binding, settings store
src/storage/       the Recordings folder: list/rename/delete/share
src/hooks/         useRecorder — wires the mic stream to a session
src/screens/       RecordScreen, LibraryScreen
src/components/    SettingsSheet, NameDialog, LevelMeter, SegmentedControl, …
```

`src/core` and `src/audio/recordingSession.ts` import nothing from React Native,
which is why the whole encode path can be tested in plain Node.

---

## Verifying

```sh
npm test        # 75 tests: WAV headers, MP3 frames, resampling, naming, settings
npm run typecheck
```

`npm test` compiles the core to CommonJS and runs Node's built-in test runner
(see [`tools/test.mjs`](tools/test.mjs)); it needs no test framework. It is
deliberately shell-free because some Windows setups block npm from spawning
`cmd.exe`.

What the tests actually check, rather than assuming:

* **MP3 is real MP3 at the requested bitrate.** Test-side MPEG frame parser
  confirms MPEG-2 Layer III, 16 kHz, monaural, and that *every* frame carries
  16/32/64 kbps; file size tracks the bitrate within 4x steps.
* **WAV is valid RIFF.** An independent reader re-parses the header (chunk
  sizes, byte rate, block align) and the payload is compared sample-for-sample
  with the input.
* **Resampling is lossless in count.** 48 kHz → 16 kHz is an exact 3:1
  decimation, and a constant signal stays constant across block seams.

The same pipeline was also run against real files and identified by `file(1)`:

```
MPEG ADTS, layer III, v2,  16 kbps, 16 kHz, Monaural
MPEG ADTS, layer III, v2,  32 kbps, 16 kHz, Monaural
MPEG ADTS, layer III, v2,  64 kbps, 16 kHz, Monaural
RIFF (little-endian) data, WAVE audio, Microsoft PCM, 16 bit, mono 16000 Hz
```

### One trap worth knowing about

`@breezystack/lamejs` declares `"main": "dist/lamejs.iife.js"`, but that bundle
assigns the encoder to a module-local variable and **never sets
`module.exports`** — so `require()` returns `{}` and `import { Mp3Encoder }`
silently becomes `undefined`. Its `exports` map hides the working ESM build from
subpath resolution too. [`metro.config.js`](metro.config.js) therefore pins the
bundler at `dist/lamejs.js` directly. Verified in a real bundle: the platform
binding compiles to `new _breezystackLamejs.Mp3Encoder(...)` resolving to that
ESM module, with the IIFE absent.

---

## Limitations

* **Foreground only, by choice.** Recording is not configured to survive the app
  being backgrounded or the screen locking. To enable it later, set
  `enableBackgroundRecording: true` in the `expo-audio` plugin config and call
  `setAudioModeAsync({ allowsBackgroundRecording: true })` — that needs a
  development build.
* **Not yet run on a physical device.** The encode/format layer is verified
  byte-for-byte, and the app bundles cleanly for Android (635 modules), but the
  native capture path has not been exercised on real hardware. Expect to confirm
  the actual delivered sample rate on first run.
* **MP3 encoding is JavaScript on the device.** Fine at these bitrates for
  speech; it would need a native encoder for high-bitrate music.
* **Recording is mono 16 kHz.** Good for speech, not for music. Raising the
  capture rate would also mean resampling down for low-bitrate MP3.
* **Files are in app-private storage.** They are reachable through the share
  sheet (and the library), but are not written to a public `Music/` folder.
* **A 16 kbps MP3 is MPEG-2 Layer III**, supported by Android, iOS and desktop
  players, but not by some very old or minimal decoders.
