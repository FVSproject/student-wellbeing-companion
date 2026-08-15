import { redirect } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';
import { UserRole } from '@prisma/client';
import { Sidebar } from '@/components/sidebar';
import { TopBar } from '@/components/topbar';
import { KeepWarm } from '@/components/keep-warm';
import { getCurrentUser } from '@/lib/auth';

export default async function AppLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  // getCurrentUser is React-cached AND self-heals (JIT-provisions if missing).
  // Both the layout and the child page share the same query result — no dupes.
  const user = await getCurrentUser();

  // New counselors without a school → onboarding.
  if (user.role === UserRole.COUNSELOR && !user.schoolId) {
    redirect(`/${locale}/onboarding`);
  }

  const contextName = user.school?.name ?? user.foundation?.name ?? null;
  const contextIcon = user.school?.iconEmoji ?? null;
  const contextLogo = user.school?.logoUrl ?? null;

  return (
    <div className="flex min-h-screen bg-muted/40">
      <KeepWarm />
      <Sidebar
        role={user.role}
        contextName={contextName}
        contextIcon={contextIcon}
        contextLogo={contextLogo}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar
          userName={user.fullName}
          role={user.role}
          contextName={contextName}
          contextIcon={contextIcon}
          contextLogo={contextLogo}
        />
        <main className="min-w-0 flex-1 p-4 md:p-8">
          <div className="animate-fade-in-up">{children}</div>
        </main>
      </div>
    </div>
  );
}
