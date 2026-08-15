'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Menu, X } from 'lucide-react';
import { UserRole } from '@prisma/client';
import { Link, usePathname } from '@/i18n/routing';
import { cn } from '@/lib/utils';
import { navFor } from './nav-items';
import { BrandMark } from './brand-mark';

export function MobileNav({
  role,
  contextName,
  contextIcon,
  contextLogo,
}: {
  role: UserRole;
  contextName: string | null;
  contextIcon?: string | null;
  contextLogo?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const t = useTranslations('nav');
  const tCommon = useTranslations('common');
  const pathname = usePathname();
  const items = navFor(role);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.body.style.overflow = open ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="btn-ghost md:hidden"
        aria-label={tCommon('menu')}
      >
        <Menu className="h-5 w-5" />
      </button>

      <div
        onClick={() => setOpen(false)}
        className={cn(
          'fixed inset-0 z-40 bg-black/40 transition-opacity md:hidden',
          open ? 'opacity-100' : 'pointer-events-none opacity-0'
        )}
        aria-hidden
      />

      <aside
        className={cn(
          'fixed inset-y-0 z-50 flex w-72 max-w-[85vw] flex-col bg-white p-4 shadow-xl transition-transform duration-200 md:hidden',
          'ltr:left-0 rtl:right-0',
          open
            ? 'translate-x-0'
            : 'ltr:-translate-x-full rtl:translate-x-full'
        )}
        aria-hidden={!open}
      >
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {contextLogo ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={contextLogo}
                alt=""
                className="h-8 w-8 rounded-md object-cover ring-1 ring-border"
              />
            ) : contextIcon ? (
              <span className="text-xl leading-none" aria-hidden>
                {contextIcon}
              </span>
            ) : (
              <BrandMark size="sm" />
            )}
            <span className="truncate text-sm font-semibold">
              {contextName ?? 'RAWAFID'}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="btn-ghost h-8 w-8 p-0"
            aria-label={tCommon('close')}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <nav className="flex flex-col gap-1">
          {items.map((item) => {
            const active =
              pathname === item.href || pathname.startsWith(`${item.href}/`);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition',
                  active
                    ? 'bg-accent text-primary'
                    : 'text-foreground hover:bg-muted'
                )}
              >
                <Icon className="h-4 w-4" />
                {t(item.labelKey)}
              </Link>
            );
          })}
        </nav>
      </aside>
    </>
  );
}
