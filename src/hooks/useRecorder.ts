/**
 * Bridges the microphone stream to a recording session.
 *
 * Audio arrives as raw PCM blocks; the session converts them to mono 16 kHz and
 * encodes them straight to disk, so a long lecture is never held in memory.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { requestRecordingPermissionsAsync, setAudioModeAsync, useAudioStream } from 'expo-audio';
import type { File } from 'expo-file-system';
import { RecordingSession } from '../audio/recordingSession';
import { CAPTURE_CHANNELS, CAPTURE_SAMPLE_RATE, type Settings } from '../core/types';
import { createMp3Encoder } from '../platform/mp3Encoder';
import { ExpoFileWriter } from '../platform/fileWriter';
import { createRecordingFile, type RecordingEntry } from '../storage/recordings';

export type RecorderPhase = 'idle' | 'starting' | 'recording' | 'paused' | 'saving';

export type RecordedTake = {
  entry: RecordingEntry;
  durationSeconds: number;
  sizeBytes: number;
};

export type Recorder = {
  phase: RecorderPhase;
  elapsedSeconds: number;
  /** Microphone amplitude, 0..1. */
  level: number;
  error: string | null;
  start: () => Promise<void>;
  pause: () => void;
  resume: () => void;
  stop: () => Promise<RecordedTake | null>;
  dismissError: () => void;
};

export function useRecorder(settings: Settings): Recorder {
  const [phase, setPhase] = useState<RecorderPhase>('idle');
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [level, setLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const sessionRef = useRef<RecordingSession | null>(null);
  const fileRef = useRef<File | null>(null);
  const phaseRef = useRef<RecorderPhase>('idle');
  const settingsRef = useRef<Settings>(settings);
  /** Settings captured when the recording started, so mid-recording edits cannot confuse it. */
  const activeSettingsRef = useRef<Settings | null>(null);

  settingsRef.current = settings;
  phaseRef.current = phase;

  const { stream } = useAudioStream({
    sampleRate: CAPTURE_SAMPLE_RATE,
    channels: CAPTURE_CHANNELS,
    // int16 halves what has to cross the native bridge. The blocks report the
    // rate and channel count the device actually delivered, and the converter
    // resamples and downmixes if those differ from what we asked for.
    encoding: 'int16',
    onBuffer: (buffer) => {
      // Ignore microphone blocks while paused or not actively recording
      if (phaseRef.current !== 'recording') return;

      sessionRef.current?.handleBlock({
        data: buffer.data,
        encoding: 'int16',
        sampleRate: buffer.sampleRate,
        channels: buffer.channels,
      });
    },
  });

  // Poll the session for the timer and level meter while actively recording
  useEffect(() => {
    if (phase !== 'recording') return;

    const id = setInterval(() => {
      const session = sessionRef.current;
      if (!session) return;
      setElapsedSeconds(session.durationSeconds);
      setLevel(session.level);
    }, 100);

    return () => clearInterval(id);
  }, [phase]);

  const start = useCallback(async () => {
    if (phaseRef.current !== 'idle') return;

    setError(null);
    setPhase('starting');

    let file: File | null = null;
    let session: RecordingSession | null = null;

    try {
      const permission = await requestRecordingPermissionsAsync();
      if (!permission.granted) {
        throw new Error('Microphone access is required to record audio.');
      }

      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });

      const snapshot: Settings = { ...settingsRef.current };
      file = createRecordingFile(snapshot.format);
      session = new RecordingSession({
        settings: snapshot,
        writer: new ExpoFileWriter(file),
        createEncoder: createMp3Encoder,
        sampleRate: CAPTURE_SAMPLE_RATE,
      });

      // Creates the file and writes the container preamble before any audio lands.
      session.begin();

      activeSettingsRef.current = snapshot;
      fileRef.current = file;
      sessionRef.current = session;

      await stream.start();

      setElapsedSeconds(0);
      setLevel(0);
      setPhase('recording');
    } catch (caught) {
      // Leave nothing half-written behind.
      sessionRef.current = null;
      fileRef.current = null;
      activeSettingsRef.current = null;

      if (session) {
        try {
          session.finish();
        } catch {
          // Nothing useful to do; the file is deleted below.
        }
      }
      if (file?.exists) {
        try {
          file.delete();
        } catch {
          // Best effort.
        }
      }
      try {
        await setAudioModeAsync({ allowsRecording: false });
      } catch {
        // Best effort.
      }

      setError(describeFailure(caught));
      setPhase('idle');
    }
  }, [stream]);

  const pause = useCallback(() => {
    if (phaseRef.current !== 'recording') return;
    phaseRef.current = 'paused';
    setPhase('paused');
    setLevel(0);
  }, []);

  const resume = useCallback(() => {
    if (phaseRef.current !== 'paused') return;
    phaseRef.current = 'recording';
    setPhase('recording');
  }, []);

  const stop = useCallback(async (): Promise<RecordedTake | null> => {
    const session = sessionRef.current;
    const file = fileRef.current;
    if (
      (phaseRef.current !== 'recording' && phaseRef.current !== 'paused') ||
      !session ||
      !file
    ) {
      return null;
    }

    setPhase('saving');
    sessionRef.current = null;

    try {
      stream.stop();
    } catch {
      // The stream may already be stopped; finishing the file still matters more.
    }

    let outcome;
    try {
      outcome = session.finish();
    } catch (caught) {
      setError(describeFailure(caught));
      setPhase('idle');
      return null;
    }

    try {
      await setAudioModeAsync({ allowsRecording: false });
    } catch {
      // Best effort.
    }

    const format = activeSettingsRef.current?.format ?? settingsRef.current.format;
    activeSettingsRef.current = null;
    fileRef.current = null;

    setLevel(0);
    setElapsedSeconds(outcome.durationSeconds);
    setPhase('idle');

    return {
      entry: {
        name: file.name,
        uri: file.uri,
        // `creationTime` can be unavailable immediately after writing; fall back
        // to now, which is when the recording was created anyway.
        sizeBytes: outcome.bytes,
        createdAtMs: file.creationTime ?? Date.now(),
        format,
      },
      durationSeconds: outcome.durationSeconds,
      sizeBytes: outcome.bytes,
    };
  }, [stream]);

  const dismissError = useCallback(() => setError(null), []);

  // Finish an in-flight recording if the screen goes away.
  useEffect(() => {
    return () => {
      const session = sessionRef.current;
      sessionRef.current = null;
      if (!session || session.isFinished) return;
      try {
        stream.stop();
      } catch {
        // Best effort.
      }
      try {
        session.finish();
      } catch {
        // Best effort.
      }
    };
  }, [stream]);

  return { phase, elapsedSeconds, level, error, start, pause, resume, stop, dismissError };
}

function describeFailure(caught: unknown): string {
  if (caught instanceof Error && caught.message) return caught.message;
  if (typeof caught === 'string' && caught) return caught;
  return 'Something went wrong while recording.';
}
