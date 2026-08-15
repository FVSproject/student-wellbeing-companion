'use client';

import { useRef, useState } from 'react';
import { Camera, Loader2, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';

const PRESET_ICONS = [
  '🏫', '🎓', '📚', '✏️',
  '🌸', '🌷', '🌟', '🌈',
  '🦋', '🌿', '💚', '🕊️',
] as const;

/**
 * Two-way school icon picker. The counselor can:
 *   1) tap one of the preset emojis, OR
 *   2) upload a custom image (resized client-side to 128x128).
 *
 * Choosing one clears the other so the write is unambiguous. Submits via
 * two hidden fields (`iconEmoji`, `logoUrl`) that the server actions parse.
 */
export function SchoolIconPicker({
  emojiName,
  logoName,
  defaultEmoji,
  defaultLogo,
  labels,
}: {
  emojiName: string;
  logoName: string;
  defaultEmoji?: string | null;
  defaultLogo?: string | null;
  labels: {
    title: string;
    presetHeading: string;
    uploadHeading: string;
    uploadCta: string;
    changeCta: string;
    clear: string;
    processing: string;
    tooLarge: string;
    hint: string;
  };
}) {
  const [emoji, setEmoji] = useState<string | null>(defaultEmoji ?? null);
  const [logo, setLogo] = useState<string | null>(defaultLogo ?? null);
  const [error, setError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  function pickEmoji(next: string) {
    setEmoji(next);
    setLogo(null);
    setError(null);
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);

    if (file.size > 8 * 1024 * 1024) {
      setError(labels.tooLarge);
      return;
    }

    setProcessing(true);
    try {
      const dataUrl = await resizeToDataUrl(file, 128, 0.85);
      setLogo(dataUrl);
      setEmoji(null);
    } catch {
      setError(labels.tooLarge);
    } finally {
      setProcessing(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  function clear() {
    setEmoji(null);
    setLogo(null);
    setError(null);
  }

  const hasSelection = emoji || logo;

  return (
    <div>
      <label className="block text-sm font-medium">{labels.title}</label>

      <div className="mt-3 flex items-start gap-4">
        <Preview emoji={emoji} logo={logo} />
        {hasSelection && (
          <button
            type="button"
            onClick={clear}
            className="btn-ghost h-8 text-xs text-rose-600 hover:bg-rose-50"
          >
            <Trash2 className="h-3.5 w-3.5 ltr:mr-1.5 rtl:ml-1.5" />
            {labels.clear}
          </button>
        )}
      </div>

      <p className="mt-4 text-xs uppercase tracking-wide text-muted-foreground">
        {labels.presetHeading}
      </p>
      <div className="mt-2 grid grid-cols-6 gap-2">
        {PRESET_ICONS.map((icon) => (
          <button
            key={icon}
            type="button"
            onClick={() => pickEmoji(icon)}
            className={cn(
              'flex h-10 w-10 items-center justify-center rounded-md text-xl transition',
              emoji === icon
                ? 'bg-primary text-primary-foreground ring-2 ring-primary ring-offset-2'
                : 'bg-muted hover:bg-accent'
            )}
            aria-pressed={emoji === icon}
          >
            {icon}
          </button>
        ))}
      </div>

      <p className="mt-4 text-xs uppercase tracking-wide text-muted-foreground">
        {labels.uploadHeading}
      </p>
      <div className="mt-2">
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          onChange={handleFile}
          className="hidden"
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={processing}
          className="btn-ghost text-xs disabled:opacity-60"
        >
          {processing ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin ltr:mr-1.5 rtl:ml-1.5" />
              {labels.processing}
            </>
          ) : logo ? (
            <>
              <Camera className="h-3.5 w-3.5 ltr:mr-1.5 rtl:ml-1.5" />
              {labels.changeCta}
            </>
          ) : (
            <>
              <Camera className="h-3.5 w-3.5 ltr:mr-1.5 rtl:ml-1.5" />
              {labels.uploadCta}
            </>
          )}
        </button>
      </div>

      {error ? (
        <p className="mt-2 text-xs text-rose-600">{error}</p>
      ) : (
        <p className="mt-2 text-xs text-muted-foreground">{labels.hint}</p>
      )}

      <input type="hidden" name={emojiName} value={emoji ?? ''} />
      <input type="hidden" name={logoName} value={logo ?? ''} />
    </div>
  );
}

function Preview({ emoji, logo }: { emoji: string | null; logo: string | null }) {
  return (
    <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-muted ring-1 ring-border">
      {logo ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img src={logo} alt="" className="h-full w-full object-cover" />
      ) : emoji ? (
        <span className="text-3xl leading-none" aria-hidden>
          {emoji}
        </span>
      ) : (
        <div className="h-8 w-8 rounded-md bg-primary/20" aria-hidden />
      )}
    </div>
  );
}

async function resizeToDataUrl(
  file: File,
  maxDim: number,
  quality: number
): Promise<string> {
  const src = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(new Error('read'));
    r.readAsDataURL(file);
  });

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error('img'));
    i.src = src;
  });

  let { width, height } = img;
  if (width > height && width > maxDim) {
    height = Math.round((height * maxDim) / width);
    width = maxDim;
  } else if (height >= width && height > maxDim) {
    width = Math.round((width * maxDim) / height);
    height = maxDim;
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas');
  ctx.drawImage(img, 0, 0, width, height);
  return canvas.toDataURL('image/jpeg', quality);
}
