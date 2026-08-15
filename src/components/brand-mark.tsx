import { cn } from '@/lib/utils';

/**
 * Small circular brand mark using the Rawafid logo. Renders in the sidebar,
 * mobile drawer, onboarding header, and landing hero.
 */
export function BrandMark({
  size = 'md',
  className,
}: {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}) {
  const dims =
    size === 'sm' ? 'h-7 w-7' :
    size === 'lg' ? 'h-14 w-14' :
    size === 'xl' ? 'h-24 w-24' :
    'h-9 w-9';

  return (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img
      src="/rawafid-logo.jpg"
      alt="Rawafid"
      className={cn(
        'shrink-0 rounded-full object-cover ring-1 ring-border bg-white',
        dims,
        className
      )}
    />
  );
}
