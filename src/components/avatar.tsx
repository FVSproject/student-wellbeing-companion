import { cn } from '@/lib/utils';

/**
 * Circle avatar. Renders the image when provided, otherwise a colored
 * initials fallback derived from `name`.
 */
export function Avatar({
  name,
  url,
  size = 'md',
  className,
}: {
  name: string;
  url?: string | null;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const dims =
    size === 'sm' ? 'h-8 w-8 text-xs' : size === 'lg' ? 'h-16 w-16 text-lg' : 'h-10 w-10 text-sm';

  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt={name}
        className={cn('shrink-0 rounded-full object-cover ring-1 ring-border', dims, className)}
      />
    );
  }

  return (
    <div
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full bg-accent font-semibold text-primary ring-1 ring-border',
        dims,
        className
      )}
      aria-hidden
    >
      {initials(name)}
    </div>
  );
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p.charAt(0)).join('').toUpperCase() || '?';
}
