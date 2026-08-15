'use client';

import { useRef, useState } from 'react';
import { Camera, Loader2, X } from 'lucide-react';

/**
 * File-upload avatar input. Resizes the image client-side to 256x256 JPEG,
 * encodes as a base64 data URL, and stores it in a hidden form field. Keeps
 * the payload small enough for a Postgres TEXT column (~30–40 KB typical)
 * so we don't need object storage for the pilot.
 *
 * When we're ready for real object storage (Vercel Blob or R2), swap the
 * `resizeToDataUrl` call with an upload → return public URL.
 */
export function AvatarUpload({
  name,
  defaultValue,
  label,
  hint,
  labels,
}: {
  name: string;
  defaultValue?: string | null;
  label: string;
  hint?: string;
  labels: { upload: string; change: string; remove: string; processing: string; tooLarge: string };
}) {
  const [preview, setPreview] = useState<string | null>(defaultValue ?? null);
  const [error, setError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);

    // 8 MB source cap. After resize the stored data URL is a fraction of this.
    if (file.size > 8 * 1024 * 1024) {
      setError(labels.tooLarge);
      return;
    }

    setProcessing(true);
    try {
      const dataUrl = await resizeToDataUrl(file, 256, 0.8);
      setPreview(dataUrl);
    } catch {
      setError(labels.tooLarge);
    } finally {
      setProcessing(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  return (
    <div>
      <label className="block text-sm font-medium">{label}</label>
      <div className="mt-2 flex items-center gap-4">
        <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-full bg-muted ring-1 ring-border">
          {preview ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={preview} alt="" className="h-full w-full object-cover" />
          ) : (
            <Camera className="h-5 w-5 text-muted-foreground" aria-hidden />
          )}
        </div>
        <div className="flex flex-col gap-1">
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            onChange={handleFile}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={processing}
            className="btn-ghost text-xs disabled:opacity-60"
          >
            {processing ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin ltr:mr-1.5 rtl:ml-1.5" />
                {labels.processing}
              </>
            ) : preview ? (
              labels.change
            ) : (
              <>
                <Camera className="h-3.5 w-3.5 ltr:mr-1.5 rtl:ml-1.5" />
                {labels.upload}
              </>
            )}
          </button>
          {preview && (
            <button
              type="button"
              onClick={() => setPreview(null)}
              className="btn-ghost text-xs text-rose-600 hover:bg-rose-50"
            >
              <X className="h-3.5 w-3.5 ltr:mr-1.5 rtl:ml-1.5" />
              {labels.remove}
            </button>
          )}
        </div>
      </div>
      {/* The form submits this value — either the fresh data URL or empty. */}
      <input type="hidden" name={name} value={preview ?? ''} />
      {error && <p className="mt-1 text-xs text-rose-600">{error}</p>}
      {!error && hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

async function resizeToDataUrl(
  file: File,
  maxDim: number,
  quality: number
): Promise<string> {
  const source = await readAsDataUrl(file);
  const img = await loadImage(source);

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
  if (!ctx) throw new Error('canvas unsupported');
  ctx.drawImage(img, 0, 0, width, height);
  return canvas.toDataURL('image/jpeg', quality);
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(new Error('read failed'));
    r.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error('image load failed'));
    i.src = src;
  });
}
