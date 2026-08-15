import { ConsentStatus, SessionStatus } from '@prisma/client';
import { cn } from '@/lib/utils';

const consentTone: Record<ConsentStatus, string> = {
  GRANTED: 'bg-emerald-100 text-emerald-800 ring-emerald-200',
  PENDING: 'bg-amber-100 text-amber-800 ring-amber-200',
  REVOKED: 'bg-rose-100 text-rose-800 ring-rose-200',
  EXPIRED: 'bg-neutral-200 text-neutral-700 ring-neutral-300',
};

const sessionTone: Record<SessionStatus, string> = {
  ACTIVE: 'bg-emerald-100 text-emerald-800 ring-emerald-200',
  SCHEDULED: 'bg-sky-100 text-sky-800 ring-sky-200',
  COMPLETED: 'bg-neutral-100 text-neutral-700 ring-neutral-300',
  CANCELLED: 'bg-neutral-100 text-neutral-500 ring-neutral-300',
};

export function ConsentBadge({ status, label }: { status: ConsentStatus; label: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset',
        consentTone[status]
      )}
    >
      {label}
    </span>
  );
}

export function SessionBadge({ status, label }: { status: SessionStatus; label: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset',
        sessionTone[status]
      )}
    >
      {label}
    </span>
  );
}
