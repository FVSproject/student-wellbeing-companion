import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import createIntlMiddleware from 'next-intl/middleware';
import { routing } from './i18n/routing';

const intlMiddleware = createIntlMiddleware(routing);

const isProtectedRoute = createRouteMatcher([
  '/:locale/dashboard(.*)',
  '/:locale/students(.*)',
  '/:locale/sessions(.*)',
  '/:locale/reports(.*)',
  '/:locale/admin(.*)',
  '/:locale/onboarding(.*)',
]);

export default clerkMiddleware(async (auth, req) => {
  if (isProtectedRoute(req)) {
    await auth.protect();
  }
  // next-intl rewrites paths — API routes shouldn't be locale-prefixed.
  if (req.nextUrl.pathname.startsWith('/api/')) {
    return;
  }
  return intlMiddleware(req);
});

export const config = {
  matcher: [
    // App + non-API pages: skip Next internals, static assets, and /api/health
    // (the keep-warm ping — pointless to auth-check 40× per hour per tab).
    '/((?!api/health|_next|_vercel|.*\\..*).*)',
    // API routes except /api/health so `auth()` works inside route handlers.
    '/(api(?!/health))(.*)',
  ],
};
