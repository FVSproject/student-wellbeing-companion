import { redirect } from 'next/navigation';
import { UserRole } from '@prisma/client';
import { getCurrentUser } from '@/lib/auth';

/**
 * Foundation-only. Any signed-in user without FOUNDATION_ADMIN role is
 * bounced back to the counselor dashboard.
 */
export default async function AdminLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const user = await getCurrentUser();
  if (user.role !== UserRole.FOUNDATION_ADMIN) {
    redirect(`/${locale}/dashboard`);
  }
  return <>{children}</>;
}
