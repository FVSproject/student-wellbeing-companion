'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Mic, MicOff, Loader2, Sparkles } from 'lucide-react';
import { AnalysisEntry } from './analysis-entry';

/**
 * Live listening panel for an active group session. Captures mic audio in
 * ~20 s chunks, uploads to /api/transcribe (which fans out to Whisper +
 * triggers the group analyzer), and polls /api/groups/[id]/live for new
 * transcripts and analyses. No biometrics — pure speech + AI observation.
 */

type Analysis = {
  id: string;
  timestamp: string;
  stateSummary: string;
  suggestedApproaches: string[];
  locale: string | null;
  model: string;
};

type TranscriptLine = {
  id: string;
  timestamp: string;
  text: string;
  speaker: string;
};

const POLL_MS = 4_000;
const AUDIO_CHUNK_MS = 20_000;
const TRANSCRIPT_CAP = 60;

type MicState =
  | 'off'
  | 'requesting'
  | 'on'
  | 'muted'
  | 'denied'
  | 'unsupported'
  | 'notConfigured';

export function GroupLivePanel({ groupId }: { groupId: string }) {
  const locale = useLocale();
  const chatLocale: 'en' | 'ar' = locale === 'ar' ? 'ar' : 'en';
  const t = useTranslations('groupSessions.live');

  const [micState, setMicState] = useState<MicState>('off');
  const [voiceLevel, setVoiceLevel] = useState(0);
  const [transcripts, setTranscripts] = useState<TranscriptLine[]>([]);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);

  const mediaStreamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const isCapturingRef = useRef(false);
  const chunkTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // --- Upload one chunk to /api/transcribe ---
  const uploadChunk = useCallback(
    async (blob: Blob, startedAt: Date, durationMs: number) => {
      if (blob.size === 0) return;
      const form = new FormData();
      form.append('groupSessionId', groupId);
      form.append('locale', chatLocale);
      form.append('startedAt', startedAt.toISOString());
      form.append('durationMs', String(durationMs));
      form.append('audio', blob, 'chunk.webm');
      try {
        const res = await fetch('/api/transcribe', { method: 'POST', body: form });
        if (res.status === 503) setMicState('notConfigured');
      } catch {
        /* transient — next chunk retries */
      }
    },
    [groupId, chatLocale]
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
      if (isCapturingRef.current) startNextChunk();
    };

    recorder.start();
    chunkTimerRef.current = setTimeout(() => {
      if (recorder.state === 'recording') recorder.stop();
    }, AUDIO_CHUNK_MS);
  }, [uploadChunk]);

  // --- Voice-level meter ---
  const startLevelMeter = useCallback((stream: MediaStream) => {
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
    let smoothed = 0;
    const tick = () => {
      analyser.getByteTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) {
        const v = (buf[i] - 128) / 128;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / buf.length);
      smoothed = smoothed * 0.6 + rms * 0.4;
      setVoiceLevel(smoothed);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }, []);

  const stopLevelMeter = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
    analyserRef.current = null;
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
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
    stopLevelMeter();
    mediaStreamRef.current?.getTracks().forEach((tr) => tr.stop());
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
      mediaStreamRef.current?.getTracks().forEach((tr) => tr.stop());
    };
  }, []);

  // --- Poll for transcripts + latest analysis ---
  useEffect(() => {
    let cancelled = false;
    let lastId: string | null = null;
    let lastAnalysisId: string | null = null;

    async function poll() {
      try {
        const qs = lastId ? `?sinceId=${lastId}` : '';
        const res = await fetch(`/api/groups/${groupId}/live${qs}`, {
          cache: 'no-store',
        });
        if (!res.ok || cancelled) return;
        const body = (await res.json()) as {
          transcripts: TranscriptLine[];
          analysis: Analysis | null;
        };
        if (body.transcripts.length > 0) {
          lastId = body.transcripts[body.transcripts.length - 1].id;
          setTranscripts((prev) => {
            // Merge without duplicates — poll overlap (StrictMode double-mount
            // or racing initial + interval) can return already-seen ids.
            const seen = new Set(prev.map((l) => l.id));
            const additions = body.transcripts.filter((l) => !seen.has(l.id));
            if (additions.length === 0) return prev;
            return [...prev, ...additions].slice(-TRANSCRIPT_CAP);
          });
        }
        if (body.analysis && body.analysis.id !== lastAnalysisId) {
          lastAnalysisId = body.analysis.id;
          setAnalysis(body.analysis);
        }
      } catch {
        /* transient */
      }
    }

    poll(); // initial hydrate
    const iv = setInterval(poll, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(iv);
    };
  }, [groupId]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [transcripts.length]);

  return (
    <div className="space-y-6">
      <MicPanel
        state={micState}
        level={voiceLevel}
        onEnable={enableMic}
        onDisable={disableMic}
        labels={{
          title: t('micTitle'),
          enable: t('micEnable'),
          mute: t('micMute'),
          unmute: t('micUnmute'),
          requesting: t('micRequesting'),
          idle: t('micIdle'),
          muted: t('micMuted'),
          denied: t('micDenied'),
          unsupported: t('micUnsupported'),
          notConfigured: t('micNotConfigured'),
          voiceSilent: t('voiceSilent'),
          voiceSoft: t('voiceSoft'),
          voiceSpeaking: t('voiceSpeaking'),
          voiceElevated: t('voiceElevated'),
          hint: t('micHint'),
        }}
      />

      <section className="card">
        <h3 className="mb-3 text-sm font-semibold">{t('transcriptTitle')}</h3>
        {transcripts.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('transcriptEmpty')}</p>
        ) : (
          <div
            ref={listRef}
            className="max-h-64 space-y-2 overflow-y-auto rounded-md bg-muted/20 p-3 text-sm"
          >
            {transcripts.map((line) => (
              <div key={line.id}>
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  {new Date(line.timestamp).toLocaleTimeString(locale)}
                </div>
                <p className="whitespace-pre-wrap">{line.text}</p>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="card">
        <div className="mb-3 flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-accent text-primary">
            <Sparkles className="h-4 w-4" />
          </div>
          <h3 className="text-sm font-semibold">{t('analysisTitle')}</h3>
        </div>
        {!analysis ? (
          <p className="text-sm text-muted-foreground">{t('analysisEmpty')}</p>
        ) : (
          <AnalysisEntry
            analysis={analysis}
            labels={{
              translating: t('analysisTranslating'),
              translatedNote: t('analysisTranslated'),
              originalNote: t('analysisOriginal'),
            }}
          />
        )}
      </section>
    </div>
  );
}

function MicPanel({
  state,
  level,
  onEnable,
  onDisable,
  labels,
}: {
  state: MicState;
  level: number;
  onEnable: () => void;
  onDisable: () => void;
  labels: {
    title: string;
    enable: string;
    mute: string;
    unmute: string;
    requesting: string;
    idle: string;
    muted: string;
    denied: string;
    unsupported: string;
    notConfigured: string;
    voiceSilent: string;
    voiceSoft: string;
    voiceSpeaking: string;
    voiceElevated: string;
    hint: string;
  };
}) {
  const active = state === 'on';
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
      ? labels.requesting
      : state === 'muted'
        ? labels.muted
        : state === 'denied'
          ? labels.denied
          : state === 'unsupported'
            ? labels.unsupported
            : state === 'notConfigured'
              ? labels.notConfigured
              : labels.idle;

  const ringColor = !active
    ? 'text-neutral-300'
    : status === 'silent'
      ? 'text-neutral-400'
      : status === 'soft'
        ? 'text-sky-500'
        : status === 'speaking'
          ? 'text-emerald-500'
          : 'text-amber-500';

  const ringScale = active ? Math.min(2.4, 1 + level * 5) : 1;
  const ringOpacity = active ? Math.min(0.7, 0.15 + level * 3) : 0;

  return (
    <div className="card">
      <div className="mb-4 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">{labels.title}</h3>
        {state === 'off' || state === 'muted' || state === 'denied' ? (
          <button onClick={onEnable} className="btn-ghost text-xs">
            <Mic className="h-3.5 w-3.5 ltr:mr-1.5 rtl:ml-1.5" />
            {state === 'muted' ? labels.unmute : labels.enable}
          </button>
        ) : state === 'on' ? (
          <button
            onClick={onDisable}
            className="btn-ghost text-xs text-rose-600 hover:bg-rose-50"
          >
            <MicOff className="h-3.5 w-3.5 ltr:mr-1.5 rtl:ml-1.5" />
            {labels.mute}
          </button>
        ) : state === 'requesting' ? (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            {labels.requesting}
          </span>
        ) : null}
      </div>

      <div className="flex flex-col items-center py-4">
        <div className="relative flex h-24 w-24 items-center justify-center">
          <span
            className={`absolute inset-0 rounded-full ${ringColor} transition-all duration-100`}
            style={{
              transform: `scale(${ringScale.toFixed(2)})`,
              opacity: ringOpacity.toFixed(2),
              backgroundColor: 'currentColor',
            }}
            aria-hidden
          />
          <span
            className={`absolute inset-0 rounded-full ${ringColor} transition-all duration-200`}
            style={{
              transform: `scale(${(ringScale * 0.7).toFixed(2)})`,
              opacity: (ringOpacity * 0.6).toFixed(2),
              backgroundColor: 'currentColor',
            }}
            aria-hidden
          />
          <div
            className={`relative flex h-16 w-16 items-center justify-center rounded-full transition-colors ${
              active ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
            }`}
          >
            {active ? <Mic className="h-6 w-6" /> : <MicOff className="h-6 w-6" />}
          </div>
        </div>

        <p className="mt-4 text-sm font-medium">{statusText}</p>
        <p className="mt-1 text-[11px] text-muted-foreground">{labels.hint}</p>
      </div>
    </div>
  );
}
