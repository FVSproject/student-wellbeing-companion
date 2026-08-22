'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocale } from 'next-intl';
import { Bluetooth, PlayCircle, StopCircle, WifiOff, Sparkles, Mic, MicOff, Loader2 } from 'lucide-react';
import { endSession } from '@/app/[locale]/(app)/sessions/actions';
import { BLE, decodeSampleBundle } from '@/lib/ble';
import type { Sample } from '@/lib/ingest-schema';
import { gsrToNervousness } from '@/lib/utils';
import { Sparkline } from './sparkline';
import { SubmitButton } from './submit-button';
import { AnalysisEntry } from './analysis-entry';

type Analysis = {
  id: string;
  timestamp: string;
  stateSummary: string;
  suggestedApproaches: string[];
  locale: string | null;
  model: string;
};

type Labels = {
  pair: string;
  pairing: string;
  paired: string;
  notSupported: string;
  simulate: string;
  stopSimulate: string;
  endSession: string;
  samplesSent: string;
  hr: string;
  hrv: string;
  spo2: string;
  gsr: string;
  skinTemp: string;
  motion: string;
  battery: string;
  reminder: string;
  analysisTitle: string;
  analysisEmpty: string;
  analysisApproaches: string;
  analysisUpdated: string;
  analysisModel: string;
  analysisTranslating: string;
  analysisTranslated: string;
  analysisOriginal: string;
  micTitle: string;
  micEnable: string;
  micMute: string;
  micUnmute: string;
  micRequesting: string;
  micIdle: string;
  micMuted: string;
  micDenied: string;
  micUnsupported: string;
  micNotConfigured: string;
  voiceSilent: string;
  voiceSoft: string;
  voiceSpeaking: string;
  voiceElevated: string;
  voiceHint: string;
};

type BluetoothDevice = {
  name?: string;
  gatt?: {
    connect: () => Promise<{
      getPrimaryService: (uuid: string) => Promise<{
        getCharacteristic: (uuid: string) => Promise<{
          startNotifications: () => Promise<{
            addEventListener: (event: 'characteristicvaluechanged', cb: (ev: Event) => void) => void;
          }>;
          value?: DataView;
        }>;
      }>;
    }>;
    disconnect: () => void;
    connected: boolean;
  };
};

const HISTORY_CAP = 60;
const ANALYSIS_POLL_MS = 5_000;
const AUDIO_CHUNK_MS = 20_000;
const TRANSCRIPT_CAP = 20;

type MicState = 'off' | 'requesting' | 'on' | 'muted' | 'denied' | 'unsupported' | 'notConfigured';
type TranscriptLine = { id: string; timestamp: string; text: string };

export function SessionLivePanel({
  sessionId,
  initialAnalysis,
  labels,
}: {
  sessionId: string;
  initialAnalysis: Analysis | null;
  labels: Labels;
}) {
  const [connState, setConnState] = useState<
    'idle' | 'pairing' | 'connected' | 'simulating' | 'error'
  >('idle');
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<Sample[]>([]);
  const [samplesSent, setSamplesSent] = useState(0);
  const [analysis, setAnalysis] = useState<Analysis | null>(initialAnalysis);

  const deviceRef = useRef<BluetoothDevice | null>(null);
  const simulateTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const locale = useLocale();
  const analysisLocale: 'en' | 'ar' = locale === 'ar' ? 'ar' : 'en';

  const lastSample = history[history.length - 1] ?? null;

  // --- Live audio: mic level meter + background Whisper transcription ---
  const [micState, setMicState] = useState<MicState>('off');
  const [voiceLevel, setVoiceLevel] = useState(0); // 0..1 smoothed for animation
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const isCapturingRef = useRef(false);
  const chunkTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);
  // Latest RMS value — piggybacked onto every biometric sample POST so the
  // analyzer sees voice activity alongside HR/GSR in each window.
  const voiceLevelRef = useRef(0);

  const uploadChunk = useCallback(
    async (audioBlob: Blob, startedAt: Date, durationMs: number) => {
      if (audioBlob.size === 0) return;
      const form = new FormData();
      form.append('sessionId', sessionId);
      form.append('locale', analysisLocale);
      form.append('startedAt', startedAt.toISOString());
      form.append('durationMs', String(durationMs));
      form.append('audio', audioBlob, 'chunk.webm');
      try {
        const res = await fetch('/api/transcribe', { method: 'POST', body: form });
        if (res.status === 503) {
          // Whisper not configured — leave mic capture on so voice-level
          // visualization still works, but stop uploading chunks.
          setMicState('notConfigured');
        }
        // Transcript is intentionally not surfaced to the counselor in the UI
        // (per spec — voice level status is what she sees). Text is still saved
        // to the DB and picked up by the analyzer bundle.
      } catch {
        // Silent — next chunk will retry.
      }
    },
    [sessionId, analysisLocale]
  );

  const startNextChunk = useCallback(() => {
    if (!isCapturingRef.current || !mediaStreamRef.current) return;
    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : 'audio/webm';
    const recorder = new MediaRecorder(mediaStreamRef.current, { mimeType });
    recorderRef.current = recorder;
    const startedAt = new Date();

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        uploadChunk(e.data, startedAt, Date.now() - startedAt.getTime());
      }
      if (isCapturingRef.current) {
        startNextChunk();
      }
    };

    recorder.start();
    chunkTimerRef.current = setTimeout(() => {
      if (recorder.state === 'recording') recorder.stop();
    }, AUDIO_CHUNK_MS);
  }, [uploadChunk]);

  const startLevelMeter = useCallback((stream: MediaStream) => {
    // The AnalyserNode gives us an instantaneous waveform — perfect for RMS.
    const AudioCtx: typeof AudioContext =
      (window as unknown as { AudioContext: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AudioCtx();
    const src = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.6;
    src.connect(analyser);
    audioCtxRef.current = ctx;
    analyserRef.current = analyser;

    const buf = new Uint8Array(analyser.fftSize);
    const tick = () => {
      analyser.getByteTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) {
        const v = (buf[i] - 128) / 128;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / buf.length);
      // Smoothing: exponential weighted moving average via ref → screen.
      const prev = voiceLevelRef.current;
      const next = prev * 0.6 + rms * 0.4;
      voiceLevelRef.current = next;
      setVoiceLevel(next);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }, []);

  const stopLevelMeter = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
    analyserRef.current = null;
    voiceLevelRef.current = 0;
    setVoiceLevel(0);
  }, []);

  const enableMic = useCallback(async () => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setMicState('unsupported');
      return;
    }
    setMicState('requesting');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      isCapturingRef.current = true;
      setMicState('on');
      startLevelMeter(stream);
      startNextChunk();
    } catch {
      setMicState('denied');
    }
  }, [startLevelMeter, startNextChunk]);

  const disableMic = useCallback(() => {
    isCapturingRef.current = false;
    if (chunkTimerRef.current) clearTimeout(chunkTimerRef.current);
    if (recorderRef.current?.state === 'recording') {
      recorderRef.current.stop();
    }
    stopLevelMeter();
    mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
    mediaStreamRef.current = null;
    setMicState('muted');
  }, [stopLevelMeter]);

  useEffect(() => {
    return () => {
      isCapturingRef.current = false;
      if (chunkTimerRef.current) clearTimeout(chunkTimerRef.current);
      if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      audioCtxRef.current?.close().catch(() => {});
      mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  // --- Poll for the latest AI analysis every ~5 seconds ---
  useEffect(() => {
    let cancelled = false;
    let lastId = initialAnalysis?.id ?? null;

    async function poll() {
      try {
        const res = await fetch(`/api/sessions/${sessionId}/latest`, {
          cache: 'no-store',
        });
        if (!res.ok || cancelled) return;
        const body = (await res.json()) as { analysis: Analysis | null };
        if (body.analysis && body.analysis.id !== lastId) {
          lastId = body.analysis.id;
          setAnalysis(body.analysis);
        }
      } catch {
        // Poll failures are non-fatal — retry on next tick.
      }
    }

    const t = setInterval(poll, ANALYSIS_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [sessionId, initialAnalysis?.id]);

  // --- POST samples to /api/ingest ---
  const postSample = useCallback(
    async (sample: Sample) => {
      // Piggyback the current voice level so it lands on the SessionSample
      // row alongside biometrics — the analyzer then bundles it naturally.
      const withVoice: Sample = {
        ...sample,
        voiceLevel:
          micState === 'on' ? Math.min(1, voiceLevelRef.current) : sample.voiceLevel ?? null,
      };
      const res = await fetch('/api/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, locale: analysisLocale, samples: [withVoice] }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Ingest failed (${res.status})`);
      }
      setSamplesSent((n) => n + 1);
      setHistory((h) => [...h.slice(-(HISTORY_CAP - 1)), withVoice]);
    },
    [sessionId, analysisLocale, micState]
  );

  // --- BLE pairing (Web Bluetooth) ---
  const handlePair = useCallback(async () => {
    setError(null);
    const nav = navigator as Navigator & { bluetooth?: { requestDevice: (opts: unknown) => Promise<BluetoothDevice> } };
    if (!nav.bluetooth) {
      setError(labels.notSupported);
      setConnState('error');
      return;
    }
    setConnState('pairing');
    try {
      // Two filters — Chrome shows a device if ANY matches. This is more
      // forgiving than UUID-only: some ESP32 BLE stacks don't consistently
      // include the 128-bit UUID in the primary advertisement packet, but
      // they always broadcast the name. `optionalServices` still lets us
      // access the sample characteristic after pairing.
      const device = await nav.bluetooth.requestDevice({
        filters: [
          { services: [BLE.SERVICE_UUID] },
          { namePrefix: 'Wellbeing' },
        ],
        optionalServices: [BLE.SERVICE_UUID],
      });
      const server = await device.gatt!.connect();
      const service = await server.getPrimaryService(BLE.SERVICE_UUID);
      const char = await service.getCharacteristic(BLE.SAMPLE_BUNDLE_CHAR);
      const notify = await char.startNotifications();
      notify.addEventListener('characteristicvaluechanged', (ev: Event) => {
        const target = ev.target as { value?: DataView };
        if (!target.value) return;
        const decoded = decodeSampleBundle(target.value);
        const sample: Sample = {
          timestamp: new Date().toISOString(),
          heartRate: decoded.heartRate,
          hrv: decoded.hrv,
          spo2: decoded.spo2,
          gsr: decoded.gsr,
          skinTemp: decoded.skinTemp,
          motionScore: decoded.motionScore,
          batteryPct: decoded.batteryPct,
        };
        postSample(sample).catch((err) => setError(String(err)));
      });
      deviceRef.current = device;
      setConnState('connected');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setConnState('error');
    }
  }, [labels.notSupported, postSample]);

  // --- Simulate (dev only) ---
  const stopSimulate = useCallback(() => {
    if (simulateTimerRef.current) {
      clearInterval(simulateTimerRef.current);
      simulateTimerRef.current = null;
    }
    setConnState('idle');
  }, []);

  const startSimulate = useCallback(() => {
    setError(null);
    setConnState('simulating');
    simulateTimerRef.current = setInterval(() => {
      const sample = generateFakeSample();
      postSample(sample).catch((err) => {
        setError(err instanceof Error ? err.message : String(err));
        stopSimulate();
      });
    }, 3000);
  }, [postSample, stopSimulate]);

  useEffect(() => {
    return () => {
      if (simulateTimerRef.current) clearInterval(simulateTimerRef.current);
      if (deviceRef.current?.gatt?.connected) deviceRef.current.gatt.disconnect();
    };
  }, []);

  const isLive = connState === 'connected' || connState === 'simulating';
  const hrSeries = useMemo(
    () => history.map((s) => s.heartRate).filter((v): v is number => v != null),
    [history]
  );
  const nervousnessSeries = useMemo(
    () =>
      history
        .map((s) => gsrToNervousness(s.gsr))
        .filter((v): v is number => v != null),
    [history]
  );

  return (
    <div className="space-y-6">
      <div className="card">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <StatusDot state={connState} />
            <span className="text-sm font-medium">
              {connState === 'idle' && 'Not connected'}
              {connState === 'pairing' && labels.pairing}
              {connState === 'connected' && labels.paired}
              {connState === 'simulating' && labels.simulate}
              {connState === 'error' && 'Error'}
            </span>
          </div>
          <div className="text-xs text-muted-foreground">
            {labels.samplesSent}: <span className="font-mono">{samplesSent}</span>
          </div>
        </div>

        {error && (
          <div className="mb-4 rounded-md bg-rose-50 px-3 py-2 text-xs text-rose-800 ring-1 ring-rose-200">
            {error}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Metric label={labels.hr} value={lastSample?.heartRate} unit="bpm" />
          <Metric label={labels.spo2} value={lastSample?.spo2} unit="%" />
          <Metric
            label={labels.gsr}
            value={gsrToNervousness(lastSample?.gsr)}
            unit="%"
          />
          <Metric label={labels.skinTemp} value={lastSample?.skinTemp} unit="°C" decimals={1} />
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <div className="rounded-md border border-border bg-muted/20 p-3 text-rose-600">
            <Sparkline
              values={hrSeries}
              min={40}
              max={140}
              label={labels.hr}
              color="currentColor"
            />
          </div>
          <div className="rounded-md border border-border bg-muted/20 p-3 text-sky-600">
            <Sparkline
              values={nervousnessSeries}
              min={0}
              max={100}
              label={labels.gsr}
              color="currentColor"
            />
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-2">
          {connState !== 'connected' && connState !== 'simulating' && (
            <>
              <button onClick={handlePair} className="btn-primary" disabled={connState === 'pairing'}>
                <Bluetooth className="h-4 w-4 ltr:mr-2 rtl:ml-2" />
                {labels.pair}
              </button>
              <button onClick={startSimulate} className="btn-ghost">
                <PlayCircle className="h-4 w-4 ltr:mr-2 rtl:ml-2" />
                {labels.simulate}
              </button>
            </>
          )}
          {connState === 'simulating' && (
            <button onClick={stopSimulate} className="btn-ghost">
              <StopCircle className="h-4 w-4 ltr:mr-2 rtl:ml-2" />
              {labels.stopSimulate}
            </button>
          )}
          {connState === 'connected' && (
            <button
              onClick={() => {
                if (deviceRef.current?.gatt?.connected) deviceRef.current.gatt.disconnect();
                setConnState('idle');
              }}
              className="btn-ghost"
            >
              <WifiOff className="h-4 w-4 ltr:mr-2 rtl:ml-2" />
              Disconnect
            </button>
          )}
        </div>
      </div>

      <MicPanel
        state={micState}
        level={voiceLevel}
        onEnable={enableMic}
        onDisable={disableMic}
        labels={labels}
      />

      <AnalysisCard analysis={analysis} labels={labels} />

      <div className="rounded-lg bg-accent px-4 py-3 text-xs text-primary">
        {labels.reminder}
      </div>

      <form action={endSession}>
        <input type="hidden" name="sessionId" value={sessionId} />
        <SubmitButton disabled={isLive && samplesSent === 0}>
          {labels.endSession}
        </SubmitButton>
      </form>
    </div>
  );
}

function Metric({
  label,
  value,
  unit,
  decimals,
}: {
  label: string;
  value: number | null | undefined;
  unit?: string;
  decimals?: number;
}) {
  const display =
    value == null || Number.isNaN(value)
      ? '—'
      : decimals != null
        ? value.toFixed(decimals)
        : String(value);
  return (
    <div className="rounded-md border border-border bg-muted/30 p-3">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 font-mono text-lg">
        {display}
        {value != null && unit && <span className="ml-1 text-xs text-muted-foreground">{unit}</span>}
      </div>
    </div>
  );
}

function StatusDot({ state }: { state: string }) {
  const color =
    state === 'connected'
      ? 'bg-emerald-500'
      : state === 'simulating'
        ? 'bg-sky-500'
        : state === 'pairing'
          ? 'bg-amber-500 animate-pulse'
          : state === 'error'
            ? 'bg-rose-500'
            : 'bg-neutral-300';
  return <span className={`inline-block h-2.5 w-2.5 rounded-full ${color}`} aria-hidden />;
}

function MicPanel({
  state,
  level,
  onEnable,
  onDisable,
  labels,
}: {
  state: MicState;
  level: number; // 0..1 smoothed RMS
  onEnable: () => void;
  onDisable: () => void;
  labels: Labels;
}) {
  const active = state === 'on';
  // Map RMS to a qualitative status the counselor can glance at.
  const status: 'silent' | 'soft' | 'speaking' | 'elevated' =
    level < 0.01 ? 'silent' : level < 0.05 ? 'soft' : level < 0.15 ? 'speaking' : 'elevated';

  const statusText = active
    ? status === 'silent'
      ? labels.voiceSilent
      : status === 'soft'
        ? labels.voiceSoft
        : status === 'speaking'
          ? labels.voiceSpeaking
          : labels.voiceElevated
    : state === 'requesting'
      ? labels.micRequesting
      : state === 'muted'
        ? labels.micMuted
        : state === 'denied'
          ? labels.micDenied
          : state === 'unsupported'
            ? labels.micUnsupported
            : state === 'notConfigured'
              ? labels.micNotConfigured
              : labels.micIdle;

  const ringColor = !active
    ? 'text-neutral-300'
    : status === 'silent'
      ? 'text-neutral-400'
      : status === 'soft'
        ? 'text-sky-500'
        : status === 'speaking'
          ? 'text-emerald-500'
          : 'text-amber-500';

  // Ring scale reacts to volume — capped to keep the layout stable.
  const ringScale = active ? Math.min(2.4, 1 + level * 5) : 1;
  const ringOpacity = active ? Math.min(0.7, 0.15 + level * 3) : 0;

  return (
    <div className="card">
      <div className="mb-4 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold">{labels.micTitle}</h3>
        </div>
        {state === 'off' || state === 'muted' || state === 'denied' ? (
          <button onClick={onEnable} className="btn-ghost text-xs">
            <Mic className="h-3.5 w-3.5 ltr:mr-1.5 rtl:ml-1.5" />
            {state === 'muted' ? labels.micUnmute : labels.micEnable}
          </button>
        ) : state === 'on' ? (
          <button onClick={onDisable} className="btn-ghost text-xs text-rose-600 hover:bg-rose-50">
            <MicOff className="h-3.5 w-3.5 ltr:mr-1.5 rtl:ml-1.5" />
            {labels.micMute}
          </button>
        ) : state === 'requesting' ? (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            {labels.micRequesting}
          </span>
        ) : null}
      </div>

      <div className="flex flex-col items-center py-4">
        <div className="relative flex h-24 w-24 items-center justify-center">
          {/* Reactive glow ring */}
          <span
            className={`absolute inset-0 rounded-full ${ringColor} transition-all duration-100`}
            style={{
              transform: `scale(${ringScale.toFixed(2)})`,
              opacity: ringOpacity.toFixed(2),
              backgroundColor: 'currentColor',
            }}
            aria-hidden
          />
          {/* Secondary softer ring */}
          <span
            className={`absolute inset-0 rounded-full ${ringColor} transition-all duration-200`}
            style={{
              transform: `scale(${(ringScale * 0.7).toFixed(2)})`,
              opacity: (ringOpacity * 0.6).toFixed(2),
              backgroundColor: 'currentColor',
            }}
            aria-hidden
          />
          {/* Core */}
          <div
            className={`relative flex h-16 w-16 items-center justify-center rounded-full transition-colors ${
              active ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
            }`}
          >
            {active ? <Mic className="h-6 w-6" /> : <MicOff className="h-6 w-6" />}
          </div>
        </div>

        <p className="mt-4 text-sm font-medium">{statusText}</p>
        <p className="mt-1 text-[11px] text-muted-foreground">{labels.voiceHint}</p>
      </div>
    </div>
  );
}

function AnalysisCard({
  analysis,
  labels,
}: {
  analysis: Analysis | null;
  labels: Labels;
}) {
  return (
    <div className="card">
      <div className="mb-3 flex items-center gap-2">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-accent text-primary">
          <Sparkles className="h-4 w-4" />
        </div>
        <h3 className="text-sm font-semibold">{labels.analysisTitle}</h3>
      </div>

      {!analysis ? (
        <p className="text-sm text-muted-foreground">{labels.analysisEmpty}</p>
      ) : (
        <AnalysisEntry
          analysis={analysis}
          labels={{
            translating: labels.analysisTranslating,
            translatedNote: labels.analysisTranslated,
            originalNote: labels.analysisOriginal,
          }}
        />
      )}
    </div>
  );
}

function generateFakeSample(): Sample {
  const t = Date.now() / 1000;
  return {
    timestamp: new Date().toISOString(),
    heartRate: 72 + Math.round(Math.sin(t / 10) * 10 + Math.random() * 4),
    hrv: 42 + Math.sin(t / 15) * 8 + Math.random() * 3,
    spo2: 97 + Math.random() * 2,
    gsr: 3.2 + Math.sin(t / 20) * 0.8 + Math.random() * 0.2,
    skinTemp: 33.6 + Math.sin(t / 30) * 0.3 + Math.random() * 0.1,
    motionScore: 0.05 + Math.abs(Math.sin(t / 5)) * 0.2,
    batteryPct: Math.max(30, 100 - Math.floor(t / 60) % 70),
  };
}
