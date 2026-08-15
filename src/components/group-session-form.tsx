'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Plus, X } from 'lucide-react';
import { Link } from '@/i18n/routing';

type StudentOption = {
  id: string;
  fullName: string;
  gradeLevel: string | null;
};

type Labels = {
  titleLabel: string;
  topicLabel: string;
  topicPlaceholder: string;
  membersLabel: string;
  membersHint: string;
  noEligibleStudents: string;
  needAtLeastTwo: string;
  extraLabel: string;
  extraHint: string;
  extraPlaceholder: string;
  extraAdd: string;
  extraRemove: string;
  startCta: string;
  starting: string;
  cancel: string;
};

export function GroupSessionForm({
  students,
  action,
  labels,
}: {
  students: StudentOption[];
  action: (formData: FormData) => Promise<void>;
  labels: Labels;
}) {
  const t = useTranslations('groupSessions');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [extras, setExtras] = useState<string[]>([]);
  const [pending, startTransition] = useTransition();

  function toggle(id: string, on: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function updateExtra(i: number, value: string) {
    setExtras((prev) => prev.map((v, idx) => (idx === i ? value : v)));
  }
  function removeExtra(i: number) {
    setExtras((prev) => prev.filter((_, idx) => idx !== i));
  }
  function addExtra() {
    setExtras((prev) => [...prev, '']);
  }

  const extraCount = extras.filter((n) => n.trim().length > 0).length;
  const totalCount = selected.size + extraCount;
  const canSubmit = totalCount >= 2 && !pending;

  return (
    <form
      action={(fd) => startTransition(() => action(fd))}
      className="card space-y-4"
    >
      <div>
        <label htmlFor="title" className="block text-sm font-medium">
          {labels.titleLabel} <span className="text-rose-600">*</span>
        </label>
        <input
          id="title"
          name="title"
          required
          maxLength={200}
          className="mt-1 w-full rounded-md border border-border bg-white px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>

      <div>
        <label htmlFor="topic" className="block text-sm font-medium">
          {labels.topicLabel}
        </label>
        <textarea
          id="topic"
          name="topic"
          rows={3}
          maxLength={1000}
          placeholder={labels.topicPlaceholder}
          className="mt-1 w-full rounded-md border border-border bg-white px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>

      <div>
        <div className="flex items-baseline justify-between">
          <label className="block text-sm font-medium">
            {labels.membersLabel} <span className="text-rose-600">*</span>
          </label>
          <span
            className={
              totalCount >= 2
                ? 'text-xs text-emerald-700'
                : 'text-xs text-muted-foreground'
            }
          >
            {t('selectedCount', { count: totalCount })}
          </span>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">{labels.membersHint}</p>
        {students.length === 0 ? (
          <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800 ring-1 ring-amber-200">
            {labels.noEligibleStudents}
          </p>
        ) : (
          <div className="mt-2 max-h-72 space-y-1 overflow-y-auto rounded-md border border-border p-2">
            {students.map((s) => {
              const checked = selected.has(s.id);
              return (
                <label
                  key={s.id}
                  className={
                    checked
                      ? 'flex cursor-pointer items-center gap-2 rounded-md bg-accent/60 px-2 py-1.5 text-sm'
                      : 'flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted/40'
                  }
                >
                  <input
                    type="checkbox"
                    name="studentIds"
                    value={s.id}
                    checked={checked}
                    onChange={(e) => toggle(s.id, e.target.checked)}
                    className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                  />
                  <span className="flex-1">{s.fullName}</span>
                  {s.gradeLevel && (
                    <span className="text-xs text-muted-foreground">
                      {s.gradeLevel}
                    </span>
                  )}
                </label>
              );
            })}
          </div>
        )}
        {totalCount > 0 && totalCount < 2 && (
          <p className="mt-2 text-xs text-amber-700">{labels.needAtLeastTwo}</p>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium">{labels.extraLabel}</label>
        <p className="mt-1 text-xs text-muted-foreground">{labels.extraHint}</p>
        {extras.length > 0 && (
          <div className="mt-2 space-y-2">
            {extras.map((name, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  type="text"
                  name="extraNames"
                  value={name}
                  onChange={(e) => updateExtra(i, e.target.value)}
                  maxLength={200}
                  placeholder={labels.extraPlaceholder}
                  className="flex-1 rounded-md border border-border bg-white px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <button
                  type="button"
                  onClick={() => removeExtra(i)}
                  aria-label={labels.extraRemove}
                  className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-rose-700"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}
        <button
          type="button"
          onClick={addExtra}
          className="btn-ghost mt-2 text-sm"
        >
          <Plus className="h-4 w-4 ltr:mr-1.5 rtl:ml-1.5" />
          {labels.extraAdd}
        </button>
      </div>

      <div className="flex gap-3 pt-2">
        <button
          type="submit"
          disabled={!canSubmit}
          className="btn-primary disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending ? labels.starting : labels.startCta}
        </button>
        <Link href="/sessions/groups" className="btn-ghost">
          {labels.cancel}
        </Link>
      </div>
    </form>
  );
}
