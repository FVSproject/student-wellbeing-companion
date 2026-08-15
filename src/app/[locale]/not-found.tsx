import { Link } from '@/i18n/routing';

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40">
      <div className="text-center">
        <p className="text-sm uppercase tracking-widest text-muted-foreground">
          404
        </p>
        <h1 className="mt-2 text-2xl font-semibold">Page not found</h1>
        <Link
          href="/"
          className="mt-6 inline-block text-sm text-primary underline underline-offset-4"
        >
          Return home
        </Link>
      </div>
    </div>
  );
}
