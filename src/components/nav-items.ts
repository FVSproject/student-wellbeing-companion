import { LayoutDashboard, Users, CalendarClock, FileText, Settings, ScrollText } from 'lucide-react';
import { UserRole } from '@prisma/client';

export type NavItem = {
  href: '/dashboard' | '/students' | '/sessions' | '/reports' | '/admin' | '/admin/audit';
  labelKey: 'dashboard' | 'students' | 'sessions' | 'reports' | 'admin' | 'audit';
  icon: React.ComponentType<{ className?: string }>;
  roles: UserRole[];
};

const ALL: UserRole[] = [UserRole.COUNSELOR, UserRole.SCHOOL_ADMIN, UserRole.FOUNDATION_ADMIN];
const COUNSELOR_ONLY: UserRole[] = [UserRole.COUNSELOR, UserRole.SCHOOL_ADMIN];
const FOUNDATION_ONLY: UserRole[] = [UserRole.FOUNDATION_ADMIN];

export const NAV_ITEMS: NavItem[] = [
  { href: '/dashboard', labelKey: 'dashboard', icon: LayoutDashboard, roles: ALL },
  { href: '/students', labelKey: 'students', icon: Users, roles: COUNSELOR_ONLY },
  { href: '/sessions', labelKey: 'sessions', icon: CalendarClock, roles: COUNSELOR_ONLY },
  { href: '/reports', labelKey: 'reports', icon: FileText, roles: COUNSELOR_ONLY },
  { href: '/admin', labelKey: 'admin', icon: Settings, roles: FOUNDATION_ONLY },
  { href: '/admin/audit', labelKey: 'audit', icon: ScrollText, roles: FOUNDATION_ONLY },
];

export function navFor(role: UserRole): NavItem[] {
  return NAV_ITEMS.filter((item) => item.roles.includes(role));
}
