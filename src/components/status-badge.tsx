import { SessionStatus } from '@prisma/client';
import { cn } from '@/lib/utils';

const sessionTone: Record<SessionStatus, string> = {
  ACTIVE: 'bg-emerald-100 text-emerald-800 ring-emerald-200',
  SCHEDULED: 'bg-sky-100 text-sky-800 ring-sky-200',
  COMPLETED: 'bg-neutral-100 text-neutral-700 ring-neutral-300',
  CANCELLED: 'bg-neutral-100 text-neutral-500 ring-neutral-300',
};

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
