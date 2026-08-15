'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Copy, Check, Trash2, Mail, LinkIcon, Users } from 'lucide-react';

/**
 * Counselor-side card for managing parent share links. Each link is a public
 * URL a parent can open to see a sanitized progress page (growth summary +
 * session dates only). Revoking is instantaneous. Copy+email helpers are
 * client-side only; no third-party mailer is required.
 */

export type ShareLink = {
  id: string;
  token: string;
  createdAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
  viewCount: number;
};

type Labels = {
  title: string;
  subtitle: string;
  generate: string;
  generating: string;
  expiresLabel: string;
  expiresHint: string;
  activeLinks: string;
  noLinks: string;
  copy: string;
  copied: string;
  revoke: string;
  confirmRevoke: string;
  sendEmail: string;
  neverExpires: string;
  revoked: string;
  emailSubject: string;
};

export function ParentShareCard({
  studentId,
  studentName,
  schoolName,
  links,
  parentEmail,
  origin,
  locale,
  labels,
  createAction,
  revokeAction,
}: {
  studentId: string;
  studentName: string;
  schoolName: string;
  links: ShareLink[];
  parentEmail: string | null;
  origin: string;
  locale: string;
  labels: Labels;
  createAction: (formData: FormData) => Promise<void>;
  revokeAction: (formData: FormData) => Promise<void>;
}) {
  const t = useTranslations('parentAccess');
  const [pending, startTransition] = useTransition();
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const activeLinks = links.filter((l) => !l.revokedAt);

  function linkUrl(token: string) {
    return `${origin}/${locale}/parent/${token}`;
  }

  async function copy(id: string, token: string) {
    try {
      await navigator.clipboard.writeText(linkUrl(token));
      setCopiedId(id);
      window.setTimeout(() => setCopiedId((c) => (c === id ? null : c)), 1800);
    } catch {
      // Clipboard permission denied — fall back to prompt so user still gets it.
      window.prompt(labels.copy, linkUrl(token));
    }
  }

  function mailto(token: string) {
    if (!parentEmail) return '';
    const url = linkUrl(token);
    const subject = encodeURIComponent(labels.emailSubject);
    const body = encodeURIComponent(
      t('emailBody', { name: studentName, school: schoolName, url })
    );
    return `mailto:${parentEmail}?subject=${subject}&body=${body}`;
  }

  return (
    <section className="card">
      <div className="mb-3 flex items-center gap-2">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-accent text-primary">
          <Users className="h-4 w-4" />
        </div>
        <h3 className="text-sm font-semibold">{labels.title}</h3>
      </div>
      <p className="mb-4 text-xs text-muted-foreground">{labels.subtitle}</p>

      <form
        action={(fd) => startTransition(() => createAction(fd))}
        className="mb-6 flex flex-wrap items-end gap-3 border-b border-border pb-4"
      >
        <input type="hidden" name="studentId" value={studentId} />
        <div>
          <label htmlFor="expiresDays" className="block text-xs font-medium">
            {labels.expiresLabel}
          </label>
          <input
            id="expiresDays"
            name="expiresDays"
            type="number"
            min={1}
            max={365}
            placeholder="30"
            className="mt-1 w-24 rounded-md border border-border bg-white px-2 py-1.5 text-sm"
          />
          <p className="mt-1 text-[11px] text-muted-foreground">
            {labels.expiresHint}
          </p>
        </div>
        <button
          type="submit"
          disabled={pending}
          className="btn-primary text-sm disabled:opacity-50"
        >
          <LinkIcon className="h-4 w-4 ltr:mr-2 rtl:ml-2" />
          {pending ? labels.generating : labels.generate}
        </button>
      </form>

      <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {labels.activeLinks}
      </h4>
      {activeLinks.length === 0 ? (
        <p className="text-sm text-muted-foreground">{labels.noLinks}</p>
      ) : (
        <ul className="space-y-2">
          {activeLinks.map((link) => {
            const created = new Date(link.createdAt).toLocaleDateString(locale);
            const expires = link.expiresAt
              ? new Date(link.expiresAt).toLocaleDateString(locale)
              : null;
            return (
              <li
                key={link.id}
                className="rounded-md border border-border bg-muted/20 p-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-mono text-xs text-muted-foreground">
                      {linkUrl(link.token)}
                    </p>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {t('createdOn', { date: created })} ·{' '}
                      {expires
                        ? t('expiresOn', { date: expires })
                        : labels.neverExpires}{' '}
                      · {t('viewCount', { count: link.viewCount })}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => copy(link.id, link.token)}
                      className="btn-ghost text-xs"
                    >
                      {copiedId === link.id ? (
                        <>
                          <Check className="h-3.5 w-3.5 ltr:mr-1 rtl:ml-1" />
                          {labels.copied}
                        </>
                      ) : (
                        <>
                          <Copy className="h-3.5 w-3.5 ltr:mr-1 rtl:ml-1" />
                          {labels.copy}
                        </>
                      )}
                    </button>
                    {parentEmail && (
                      <a href={mailto(link.token)} className="btn-ghost text-xs">
                        <Mail className="h-3.5 w-3.5 ltr:mr-1 rtl:ml-1" />
                        {labels.sendEmail}
                      </a>
                    )}
                    <form
                      action={(fd) => startTransition(() => revokeAction(fd))}
                      onSubmit={(e) => {
                        if (!window.confirm(labels.confirmRevoke)) {
                          e.preventDefault();
                        }
                      }}
                    >
                      <input type="hidden" name="studentId" value={studentId} />
                      <input type="hidden" name="linkId" value={link.id} />
                      <button
                        type="submit"
                        className="btn-ghost text-xs text-rose-700"
                      >
                        <Trash2 className="h-3.5 w-3.5 ltr:mr-1 rtl:ml-1" />
                        {labels.revoke}
                      </button>
                    </form>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
