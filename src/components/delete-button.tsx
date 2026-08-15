'use client';

import { useRef } from 'react';
import { Trash2 } from 'lucide-react';
import { SubmitButton } from './submit-button';

/**
 * A destructive action button. Wraps a form around a server action, and
 * intercepts submit to require the user to confirm via a native prompt.
 * Native confirm keeps the bundle tiny and the flow blocking, which is
 * what we want for "delete forever" style operations.
 */
export function DeleteButton({
  action,
  hiddenFields,
  confirmMessage,
  label,
}: {
  action: (formData: FormData) => Promise<void>;
  hiddenFields: Record<string, string>;
  confirmMessage: string;
  label: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={formRef}
      action={action}
      onSubmit={(e) => {
        if (!window.confirm(confirmMessage)) {
          e.preventDefault();
        }
      }}
    >
      {Object.entries(hiddenFields).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <SubmitButton
        className="inline-flex items-center justify-center rounded-md bg-rose-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-rose-700 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 focus-visible:ring-offset-2"
      >
        <Trash2 className="h-4 w-4 ltr:mr-2 rtl:ml-2" />
        {label}
      </SubmitButton>
    </form>
  );
}
