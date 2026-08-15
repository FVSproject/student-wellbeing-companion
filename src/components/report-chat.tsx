'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MessageCircle, Send, X, Sparkles } from 'lucide-react';

/**
 * Ephemeral chatbot drawer for asking questions about a single session or a
 * student's whole record. Nothing is stored — the conversation lives only in
 * component state, and the server rebuilds context from the DB on every turn.
 */

type Mode = 'session' | 'student' | 'group';
type Msg = { role: 'user' | 'assistant'; content: string };

export type ChatLabels = {
  fab: string;
  title: string;
  subtitle: string;
  placeholder: string;
  send: string;
  thinking: string;
  errorGeneric: string;
  emptyState: string;
  close: string;
};

export function ReportChat({
  mode,
  id,
  locale,
  labels,
}: {
  mode: Mode;
  id: string;
  locale: 'en' | 'ar';
  labels: ChatLabels;
}) {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  // Portal to document.body so page-level transforms (e.g. animate-fade-in-up)
  // don't trap our fixed-positioned button/drawer inside a scrolled container.
  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [msgs, busy, open]);

  async function submit() {
    const question = draft.trim();
    if (!question || busy) return;

    const history = msgs.slice(-8);
    setMsgs((m) => [...m, { role: 'user', content: question }]);
    setDraft('');
    setBusy(true);
    setErr(null);

    try {
      const res = await fetch(`/api/chat/${mode}/${id}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ locale, question, history }),
      });
      if (!res.ok) {
        setErr(labels.errorGeneric);
        return;
      }
      const data = (await res.json()) as { text?: string };
      if (data.text) {
        setMsgs((m) => [...m, { role: 'assistant', content: data.text ?? '' }]);
      } else {
        setErr(labels.errorGeneric);
      }
    } catch {
      setErr(labels.errorGeneric);
    } finally {
      setBusy(false);
    }
  }

  if (!mounted) return null;

  return createPortal(
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={labels.fab}
        className="fixed bottom-6 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-white shadow-lg ring-1 ring-primary/30 transition hover:scale-105 ltr:right-6 rtl:left-6"
      >
        <MessageCircle className="h-6 w-6" />
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-end bg-black/30 p-0 sm:items-end sm:p-6"
          onClick={() => setOpen(false)}
        >
          <div
            className="flex h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl ring-1 ring-border sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
            dir={locale === 'ar' ? 'rtl' : 'ltr'}
          >
            <div className="flex items-start justify-between gap-3 border-b border-border bg-accent/40 px-4 py-3">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-white">
                  <Sparkles className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold">{labels.title}</h3>
                  <p className="text-xs text-muted-foreground">{labels.subtitle}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label={labels.close}
                className="rounded-md p-1 text-muted-foreground hover:bg-muted"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
              {msgs.length === 0 ? (
                <p className="text-center text-xs text-muted-foreground">
                  {labels.emptyState}
                </p>
              ) : (
                msgs.map((m, i) => (
                  <div
                    key={i}
                    className={
                      m.role === 'user'
                        ? 'ms-6 rounded-2xl bg-primary px-3 py-2 text-sm text-white'
                        : 'me-6 rounded-2xl bg-muted px-3 py-2 text-sm'
                    }
                  >
                    <p className="whitespace-pre-wrap">{m.content}</p>
                  </div>
                ))
              )}
              {busy && (
                <div className="me-6 rounded-2xl bg-muted px-3 py-2 text-xs italic text-muted-foreground">
                  {labels.thinking}
                </div>
              )}
              {err && (
                <div className="rounded-md bg-rose-50 px-3 py-2 text-xs text-rose-700 ring-1 ring-rose-200">
                  {err}
                </div>
              )}
            </div>

            <form
              className="flex items-center gap-2 border-t border-border bg-white px-3 py-3"
              onSubmit={(e) => {
                e.preventDefault();
                submit();
              }}
            >
              <input
                type="text"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder={labels.placeholder}
                disabled={busy}
                className="flex-1 rounded-md border border-border bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-60"
              />
              <button
                type="submit"
                disabled={busy || draft.trim().length === 0}
                aria-label={labels.send}
                className="flex h-9 w-9 items-center justify-center rounded-md bg-primary text-white disabled:opacity-40"
              >
                <Send className="h-4 w-4" />
              </button>
            </form>
          </div>
        </div>
      )}
    </>,
    document.body
  );
}
