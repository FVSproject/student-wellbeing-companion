'use client';

import { Printer } from 'lucide-react';

export function PrintButton({ label }: { label: string }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="btn-primary no-print"
    >
      <Printer className="h-4 w-4 ltr:mr-2 rtl:ml-2" />
      {label}
    </button>
  );
}
