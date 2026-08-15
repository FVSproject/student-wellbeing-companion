import { UserButton } from '@clerk/nextjs';
import { UserRole } from '@prisma/client';
import { LocaleSwitcher } from './locale-switcher';
import { MobileNav } from './mobile-nav';

export function TopBar({
  userName,
  role,
  contextName,
  contextIcon,
  contextLogo,
}: {
  userName: string;
  role: UserRole;
  contextName: string | null;
  contextIcon?: string | null;
  contextLogo?: string | null;
}) {
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-white/80 px-4 backdrop-blur md:px-6">
      <div className="flex items-center gap-2">
        <MobileNav
          role={role}
          contextName={contextName}
          contextIcon={contextIcon}
          contextLogo={contextLogo}
        />
        <div className="hidden text-sm text-muted-foreground md:block">
          {userName}
        </div>
      </div>
      <div className="flex items-center gap-2 md:gap-3">
        <LocaleSwitcher />
        <UserButton
          appearance={{
            elements: { userButtonAvatarBox: 'h-8 w-8' },
          }}
        />
      </div>
    </header>
  );
}
