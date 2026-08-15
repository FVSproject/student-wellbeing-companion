'use client';

import { useFormStatus } from 'react-dom';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * A submit button that shows a spinner + disables the moment the form is
 * pending. Wire it inside any `<form action={serverAction}>` and the user
 * gets immediate feedback even if the server takes a second or two.
 */
export function SubmitButton({
  children,
  className,
  pendingLabel,
  disabled,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  pendingLabel?: string;
}) {
  const { pending } = useFormStatus();
  const isDisabled = pending || disabled;

  return (
    <button
      type="submit"
      disabled={isDisabled}
      className={cn(
        className ?? 'btn-primary',
        'relative inline-flex items-center justify-center transition',
        isDisabled && 'cursor-not-allowed opacity-70'
      )}
      {...props}
    >
      {pending && (
        <Loader2 className="h-4 w-4 animate-spin ltr:mr-2 rtl:ml-2" aria-hidden />
      )}
      {pending && pendingLabel ? pendingLabel : children}
    </button>
  );
}
