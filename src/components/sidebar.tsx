'use client';

import { useTranslations } from 'next-intl';
import { UserRole } from '@prisma/client';
import { Link, usePathname } from '@/i18n/routing';
import { cn } from '@/lib/utils';
import { navFor } from './nav-items';
import { BrandMark } from './brand-mark';

export function Sidebar({
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
  const t = useTranslations('nav');
  const pathname = usePathname();
  const items = navFor(role);

  return (
    <aside className="hidden w-64 shrink-0 border-border bg-white p-4 ltr:border-r rtl:border-l md:block">
      <div className="mb-8 px-2">
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
          <span className="truncate text-sm font-semibold tracking-tight">
            {contextName ?? 'RAWAFID'}
          </span>
        </div>
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
  );
}
