'use client';
import { useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ImageUp, Loader2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { productPhotoProblem, removeProductPhoto, uploadProductPhoto } from '@/lib/admin/products';
import { getApiErrorMessage } from '@/lib/apiErrors';
import ProductImage from '@/components/shop/ProductImage';

interface Props {
  productId: string;
  name: string;
  /** what the server holds now (admin record): signed link, key and review state */
  imageUrl: string | null;
  hasPhoto: boolean;
  contentStatus?: string;
}

/**
 * Pack photo: upload, replace or remove. The file goes straight to the API and
 * from there only to the server object store; the preview is the server's own
 * signed link. A new photo is reviewed by a pharmacist with the copy (C-19) —
 * customers see it only after approval.
 */
export default function ProductPhotoPanel({ productId, name, imageUrl, hasPhoto, contentStatus }: Props) {
  const queryClient = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState('');
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['admin', 'products'] });
  const onError = (err: unknown) => setError(getApiErrorMessage(err, 'Could not save the photo'));

  const upload = useMutation({
    mutationFn: (file: File) => uploadProductPhoto(productId, file),
    onSuccess: () => { setError(''); toast.success('Photo saved — a pharmacist will review it before customers see it'); },
    onError,
    onSettled: refresh,
  });
  const remove = useMutation({
    mutationFn: () => removeProductPhoto(productId),
    onSuccess: () => { setError(''); toast.success('Photo removed'); },
    onError,
    onSettled: refresh,
  });
  const busy = upload.isPending || remove.isPending;

  const onPick = (file: File | undefined) => {
    if (input.current) input.current.value = '';
    if (!file) return;
    const problem = productPhotoProblem(file);
    if (problem) return setError(problem);
    upload.mutate(file);
  };

  return (
    <section className="card mb-4" aria-labelledby="pack-photo-heading">
      <h2 id="pack-photo-heading" className="font-semibold text-sm mb-3">Pack photo</h2>
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="w-40 shrink-0">
          <ProductImage name={name} imageUrl={imageUrl} size="lg" />
        </div>
        <div className="flex-1 text-sm space-y-2">
          <p className="text-xs text-gray-600">
            A clear photo of this exact product and pack (JPEG, PNG or WebP, up to 2 MB). A pharmacist reviews every new
            photo with the product copy before customers see it (C-19).
          </p>
          {hasPhoto && contentStatus === 'pending_review' && (
            <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2">
              Waiting for pharmacist approval — customers do not see this photo yet.
            </p>
          )}
          {hasPhoto && contentStatus === 'rejected' && (
            <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-2">
              The pharmacist rejected the copy or photo; replace it or fix the copy to send it back for review.
            </p>
          )}
          {hasPhoto && !imageUrl && <p className="text-xs text-gray-500">The photo store is not reachable right now.</p>}
          <input
            ref={input}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            id="pack-photo-file"
            aria-label="Pack photo file"
            onChange={(e) => onPick(e.target.files?.[0])}
            disabled={busy}
          />
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-outline text-xs inline-flex items-center gap-1" disabled={busy} onClick={() => input.current?.click()}>
              {upload.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ImageUp className="w-3.5 h-3.5" />}
              {hasPhoto ? 'Replace photo' : 'Upload photo'}
            </button>
            {hasPhoto && (
              <button type="button" className="btn-outline text-xs text-red-600 inline-flex items-center gap-1" disabled={busy} onClick={() => remove.mutate()}>
                {remove.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                Remove photo
              </button>
            )}
          </div>
          {error && <p className="text-xs text-red-600" role="alert">{error}</p>}
        </div>
      </div>
    </section>
  );
}
