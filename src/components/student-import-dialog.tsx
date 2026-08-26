'use client';

import { useMemo, useRef, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { createPortal } from 'react-dom';
import {
  Upload,
  X,
  Trash2,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
  Download,
} from 'lucide-react';
import { StudentSex } from '@prisma/client';
import {
  createStudentsBulk,
  type BulkImportResult,
} from '@/app/[locale]/(app)/students/actions';

/**
 * Excel import dialog for student rosters. Parses the sheet entirely in the
 * browser (via SheetJS, dynamically imported so the ~1MB library doesn't
 * ship in the main bundle), lets the counselor edit each row and pick which
 * to import, then calls the createStudentsBulk server action.
 *
 * Expected columns (English or Arabic headers, case-insensitive):
 *   externalId | studentId | رقم الطالبة        (required)
 *   fullName   | name       | الاسم              (required)
 *   gradeLevel | grade      | الصف
 *   age        | العمر
 *   sex        | الجنس        (Female / Male / Unspecified / أنثى / ذكر)
 *   phone      | جوال
 *   parentPhone | parent phone | جوال ولي الأمر
 *   parentEmail | parent email | بريد ولي الأمر
 *   notes      | ملاحظات
 */

type ImportRow = {
  id: string; // client-side row id
  selected: boolean;
  externalId: string;
  fullName: string;
  gradeLevel: string;
  age: string;
  sex: '' | StudentSex;
  phone: string;
  parentPhone: string;
  parentEmail: string;
  notes: string;
  error: string | null;
};

type Labels = {
  triggerButton: string;
  dialogTitle: string;
  dialogSubtitle: string;
  chooseFile: string;
  reselectFile: string;
  downloadTemplate: string;
  parsing: string;
  parseError: string;
  emptyFile: string;
  selectAll: string;
  clearAll: string;
  addSelected: string;
  addAll: string;
  addOne: string;
  remove: string;
  cancel: string;
  close: string;
  importing: string;
  successTitle: string;
  skippedTitle: string;
  skippedDuplicate: string;
  colId: string;
  colName: string;
  colGrade: string;
  colAge: string;
  colSex: string;
  colPhone: string;
  colParentPhone: string;
  colParentEmail: string;
  colActions: string;
  sexFemale: string;
  sexMale: string;
  sexUnspecified: string;
  errorMissingRequired: string;
  errorInvalidEmail: string;
  errorInvalidAge: string;
  helpTitle: string;
  helpBody: string;
};

export function StudentImportDialog({ labels }: { labels: Labels }) {
  const tNs = useTranslations('studentImport');
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [parseErr, setParseErr] = useState<string | null>(null);
  const [result, setResult] = useState<BulkImportResult | null>(null);
  const [pending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  // Mount marker for portal (avoids SSR mismatch).
  useMemo(() => {
    if (typeof window !== 'undefined') setMounted(true);
  }, []);

  const selectedCount = rows.filter((r) => r.selected && !r.error).length;
  const validCount = rows.filter((r) => !r.error).length;

  function reset() {
    setRows([]);
    setParseErr(null);
    setResult(null);
    setBusy(false);
    if (fileRef.current) fileRef.current.value = '';
  }

  function close() {
    setOpen(false);
    setTimeout(reset, 200);
  }

  async function handleFile(file: File) {
    setBusy(true);
    setParseErr(null);
    setResult(null);
    try {
      const XLSX = await import('xlsx');
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      if (!sheet) {
        setParseErr(labels.emptyFile);
        setBusy(false);
        return;
      }
      const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
        defval: '',
        raw: false,
      });
      if (json.length === 0) {
        setParseErr(labels.emptyFile);
        setBusy(false);
        return;
      }
      const parsed = json.map((row, i) => rowFromExcel(row, i));
      setRows(parsed);
    } catch (err) {
      setParseErr(err instanceof Error ? err.message : labels.parseError);
    } finally {
      setBusy(false);
    }
  }

  function updateRow(id: string, patch: Partial<ImportRow>) {
    setRows((prev) =>
      prev.map((r) => (r.id === id ? validateRow({ ...r, ...patch }, labels) : r))
    );
  }

  function toggleAll(v: boolean) {
    setRows((prev) => prev.map((r) => (r.error ? r : { ...r, selected: v })));
  }

  async function importSubset(subset: 'selected' | 'all' | string) {
    let toImport: ImportRow[];
    if (subset === 'selected') {
      toImport = rows.filter((r) => r.selected && !r.error);
    } else if (subset === 'all') {
      toImport = rows.filter((r) => !r.error);
    } else {
      toImport = rows.filter((r) => r.id === subset && !r.error);
    }
    if (toImport.length === 0) return;

    startTransition(async () => {
      try {
        const res = await createStudentsBulk({
          students: toImport.map((r) => ({
            externalId: r.externalId.trim(),
            fullName: r.fullName.trim(),
            gradeLevel: r.gradeLevel.trim() || null,
            age: r.age.trim() ? Number(r.age) : null,
            sex: r.sex || null,
            phone: r.phone.trim() || null,
            parentPhone: r.parentPhone.trim() || null,
            parentEmail: r.parentEmail.trim() || null,
            notes: r.notes.trim() || null,
          })),
        });
        setResult(res);
        // Drop the imported rows from the preview table so remaining rows are
        // clearly what's still pending.
        const importedIds = new Set(toImport.map((r) => r.externalId));
        setRows((prev) =>
          prev.filter((r) => !importedIds.has(r.externalId.trim()))
        );
      } catch (err) {
        setParseErr(
          err instanceof Error ? err.message : labels.parseError
        );
      }
    });
  }

  function downloadTemplate() {
    // A single-row template CSV is easiest — Excel opens CSVs cleanly and the
    // counselor doesn't need SheetJS to author it. Include both header sets.
    const csv =
      'externalId,fullName,gradeLevel,age,sex,phone,parentPhone,parentEmail,notes\n' +
      'STU-001,طالبة أ,الصف السادس,12,FEMALE,05xxxxxxxx,05xxxxxxxx,parent@example.com,ملاحظات اختيارية\n';
    const blob = new Blob(['﻿' + csv], {
      type: 'text/csv;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'students-template.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  const trigger = (
    <button
      type="button"
      onClick={() => setOpen(true)}
      className="btn-ghost text-sm"
    >
      <FileSpreadsheet className="h-4 w-4 ltr:mr-2 rtl:ml-2" />
      {labels.triggerButton}
    </button>
  );

  if (!mounted) return trigger;

  return (
    <>
      {trigger}
      {open &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:p-8"
            onClick={close}
          >
            <div
              className="w-full max-w-5xl rounded-2xl bg-white shadow-2xl ring-1 ring-border"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
                <div>
                  <h2 className="text-lg font-semibold">{labels.dialogTitle}</h2>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {labels.dialogSubtitle}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={close}
                  aria-label={labels.close}
                  className="rounded-md p-1 text-muted-foreground hover:bg-muted"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* File picker */}
              <div className="border-b border-border px-5 py-4">
                <input
                  ref={fileRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleFile(f);
                  }}
                />
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    className="btn-primary text-sm"
                    disabled={busy}
                  >
                    <Upload className="h-4 w-4 ltr:mr-2 rtl:ml-2" />
                    {rows.length > 0 ? labels.reselectFile : labels.chooseFile}
                  </button>
                  <button
                    type="button"
                    onClick={downloadTemplate}
                    className="btn-ghost text-sm"
                  >
                    <Download className="h-4 w-4 ltr:mr-2 rtl:ml-2" />
                    {labels.downloadTemplate}
                  </button>
                  {busy && (
                    <span className="text-xs text-muted-foreground">
                      {labels.parsing}
                    </span>
                  )}
                </div>
                {parseErr && (
                  <div className="mt-3 flex items-start gap-2 rounded-md bg-rose-50 px-3 py-2 text-xs text-rose-800 ring-1 ring-rose-200">
                    <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <p>{parseErr}</p>
                  </div>
                )}
                {result && (
                  <div className="mt-3 space-y-2">
                    <div className="flex items-start gap-2 rounded-md bg-emerald-50 px-3 py-2 text-xs text-emerald-800 ring-1 ring-emerald-200">
                      <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      <div>
                        <p className="font-semibold">{labels.successTitle}</p>
                        <p>{tNs('successBody', { count: result.created })}</p>
                      </div>
                    </div>
                    {result.skipped.length > 0 && (
                      <div className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900 ring-1 ring-amber-200">
                        <p className="font-semibold">{labels.skippedTitle}</p>
                        <ul className="mt-1 list-disc ltr:pl-5 rtl:pr-5">
                          {result.skipped.map((s) => (
                            <li key={s.externalId}>
                              {s.externalId} — {s.fullName}{' '}
                              <span className="text-amber-700">
                                ({labels.skippedDuplicate})
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Preview / edit table */}
              {rows.length > 0 && (
                <>
                  <div className="max-h-[55vh] overflow-y-auto px-5 py-4">
                    <div className="mb-3 flex items-center gap-3 text-xs">
                      <button
                        type="button"
                        onClick={() => toggleAll(true)}
                        className="text-primary hover:underline"
                      >
                        {labels.selectAll}
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleAll(false)}
                        className="text-muted-foreground hover:text-foreground"
                      >
                        {labels.clearAll}
                      </button>
                      <span className="ms-auto text-muted-foreground">
                        {selectedCount} / {validCount}
                      </span>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[900px] text-xs">
                        <thead className="border-b border-border text-[10px] uppercase tracking-wide text-muted-foreground">
                          <tr>
                            <Th className="w-8"> </Th>
                            <Th>{labels.colId}</Th>
                            <Th>{labels.colName}</Th>
                            <Th>{labels.colGrade}</Th>
                            <Th className="w-14">{labels.colAge}</Th>
                            <Th>{labels.colSex}</Th>
                            <Th>{labels.colPhone}</Th>
                            <Th>{labels.colParentPhone}</Th>
                            <Th>{labels.colParentEmail}</Th>
                            <Th className="text-end">{labels.colActions}</Th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {rows.map((r) => (
                            <RowEditor
                              key={r.id}
                              row={r}
                              onChange={(patch) => updateRow(r.id, patch)}
                              onRemove={() =>
                                setRows((prev) => prev.filter((x) => x.id !== r.id))
                              }
                              onAddOne={() => importSubset(r.id)}
                              labels={labels}
                              disabled={pending}
                            />
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Footer actions */}
                  <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border bg-muted/20 px-5 py-4">
                    <button
                      type="button"
                      onClick={close}
                      className="btn-ghost text-sm"
                    >
                      {labels.cancel}
                    </button>
                    <button
                      type="button"
                      onClick={() => importSubset('selected')}
                      disabled={pending || selectedCount === 0}
                      className="btn-ghost text-sm disabled:opacity-40"
                    >
                      {pending ? labels.importing : `${labels.addSelected} (${selectedCount})`}
                    </button>
                    <button
                      type="button"
                      onClick={() => importSubset('all')}
                      disabled={pending || validCount === 0}
                      className="btn-primary text-sm disabled:opacity-40"
                    >
                      {pending ? labels.importing : `${labels.addAll} (${validCount})`}
                    </button>
                  </div>
                </>
              )}

              {rows.length === 0 && !parseErr && !busy && (
                <div className="px-5 py-8 text-center text-sm text-muted-foreground">
                  <p className="font-semibold text-foreground">{labels.helpTitle}</p>
                  <p className="mt-2 whitespace-pre-wrap">{labels.helpBody}</p>
                </div>
              )}
            </div>
          </div>,
          document.body
        )}
    </>
  );
}

function RowEditor({
  row,
  onChange,
  onRemove,
  onAddOne,
  labels,
  disabled,
}: {
  row: ImportRow;
  onChange: (patch: Partial<ImportRow>) => void;
  onRemove: () => void;
  onAddOne: () => void;
  labels: Labels;
  disabled: boolean;
}) {
  return (
    <tr className={row.error ? 'bg-rose-50/40' : 'hover:bg-muted/20'}>
      <Td>
        <input
          type="checkbox"
          checked={row.selected && !row.error}
          disabled={!!row.error}
          onChange={(e) => onChange({ selected: e.target.checked })}
        />
      </Td>
      <Td>
        <Input value={row.externalId} onChange={(v) => onChange({ externalId: v })} />
      </Td>
      <Td>
        <Input value={row.fullName} onChange={(v) => onChange({ fullName: v })} />
      </Td>
      <Td>
        <Input value={row.gradeLevel} onChange={(v) => onChange({ gradeLevel: v })} />
      </Td>
      <Td>
        <Input value={row.age} onChange={(v) => onChange({ age: v })} />
      </Td>
      <Td>
        <select
          value={row.sex}
          onChange={(e) => onChange({ sex: e.target.value as '' | StudentSex })}
          className="w-full rounded border border-border bg-white px-1 py-0.5 text-xs"
        >
          <option value="">—</option>
          <option value={StudentSex.FEMALE}>{labels.sexFemale}</option>
          <option value={StudentSex.MALE}>{labels.sexMale}</option>
          <option value={StudentSex.UNSPECIFIED}>{labels.sexUnspecified}</option>
        </select>
      </Td>
      <Td>
        <Input value={row.phone} onChange={(v) => onChange({ phone: v })} />
      </Td>
      <Td>
        <Input value={row.parentPhone} onChange={(v) => onChange({ parentPhone: v })} />
      </Td>
      <Td>
        <Input
          value={row.parentEmail}
          onChange={(v) => onChange({ parentEmail: v })}
        />
      </Td>
      <Td className="text-end">
        <div className="flex items-center justify-end gap-1">
          <button
            type="button"
            onClick={onAddOne}
            disabled={disabled || !!row.error}
            title={labels.addOne}
            className="rounded p-1 text-primary hover:bg-accent/50 disabled:opacity-30"
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={onRemove}
            title={labels.remove}
            className="rounded p-1 text-rose-600 hover:bg-rose-50"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
        {row.error && (
          <div className="mt-1 flex items-center gap-1 text-[10px] text-rose-700">
            <AlertCircle className="h-3 w-3" />
            {row.error}
          </div>
        )}
      </Td>
    </tr>
  );
}

function Th({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <th className={`px-2 py-2 text-start font-medium ${className}`}>{children}</th>;
}

function Td({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <td className={`px-2 py-1.5 align-top ${className}`}>{children}</td>;
}

function Input({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded border border-border bg-white px-1.5 py-0.5 text-xs focus:border-primary focus:outline-none"
    />
  );
}

// ---------- header mapping ----------

// Normalize a header cell for matching (lowercase, strip spaces + underscores + hyphens).
function norm(s: string): string {
  return s.toLowerCase().replace(/[\s_\-]+/g, '');
}

const HEADER_ALIASES: Record<keyof ImportRow, string[]> = {
  externalId: ['externalid', 'studentid', 'id', 'رقمالطالبة', 'رقمالطالب', 'رقم'],
  fullName: ['fullname', 'name', 'studentname', 'الاسم', 'الاسمالكامل'],
  gradeLevel: ['gradelevel', 'grade', 'الصف', 'المستوى'],
  age: ['age', 'العمر', 'السن'],
  sex: ['sex', 'gender', 'الجنس'],
  phone: ['phone', 'mobile', 'جوال', 'الهاتف'],
  parentPhone: ['parentphone', 'parentmobile', 'guardianphone', 'جوالوليالأمر', 'هاتفوليالأمر'],
  parentEmail: ['parentemail', 'guardianemail', 'بريدوليالأمر'],
  notes: ['notes', 'note', 'comment', 'ملاحظات'],
  // Non-data fields, ignored for import mapping.
  id: [],
  selected: [],
  error: [],
};

function pickCell(row: Record<string, unknown>, aliases: string[]): string {
  for (const key of Object.keys(row)) {
    if (aliases.includes(norm(key))) {
      const v = row[key];
      return v == null ? '' : String(v).trim();
    }
  }
  return '';
}

function normalizeSex(raw: string): '' | StudentSex {
  const n = norm(raw);
  if (['female', 'f', 'أنثى', 'انثى', 'طالبة'].includes(n)) return StudentSex.FEMALE;
  if (['male', 'm', 'ذكر', 'طالب'].includes(n)) return StudentSex.MALE;
  if (['unspecified', 'other', 'غيرمحدد', 'اخرى'].includes(n))
    return StudentSex.UNSPECIFIED;
  return '';
}

function rowFromExcel(row: Record<string, unknown>, i: number): ImportRow {
  const built: ImportRow = {
    id: `row-${i}-${Math.random().toString(36).slice(2, 8)}`,
    selected: true,
    externalId: pickCell(row, HEADER_ALIASES.externalId),
    fullName: pickCell(row, HEADER_ALIASES.fullName),
    gradeLevel: pickCell(row, HEADER_ALIASES.gradeLevel),
    age: pickCell(row, HEADER_ALIASES.age),
    sex: normalizeSex(pickCell(row, HEADER_ALIASES.sex)),
    phone: pickCell(row, HEADER_ALIASES.phone),
    parentPhone: pickCell(row, HEADER_ALIASES.parentPhone),
    parentEmail: pickCell(row, HEADER_ALIASES.parentEmail),
    notes: pickCell(row, HEADER_ALIASES.notes),
    error: null,
  };
  // Auto-fill an externalId if the sheet only has names — counselor can edit.
  if (!built.externalId && built.fullName) {
    built.externalId = `AUTO-${String(i + 1).padStart(3, '0')}`;
  }
  return validateRow(built, null);
}

function validateRow(row: ImportRow, labels: Labels | null): ImportRow {
  const errs: string[] = [];
  if (!row.externalId.trim() || !row.fullName.trim()) {
    errs.push(labels?.errorMissingRequired ?? 'Missing required fields');
  }
  if (row.age.trim()) {
    const n = Number(row.age);
    if (!Number.isFinite(n) || n < 3 || n > 25 || !Number.isInteger(n)) {
      errs.push(labels?.errorInvalidAge ?? 'Invalid age');
    }
  }
  if (row.parentEmail.trim() && !/^\S+@\S+\.\S+$/.test(row.parentEmail.trim())) {
    errs.push(labels?.errorInvalidEmail ?? 'Invalid email');
  }
  return { ...row, error: errs.length > 0 ? errs.join(' · ') : null };
}
