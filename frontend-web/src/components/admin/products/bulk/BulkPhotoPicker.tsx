'use client';
import { useState, type DragEvent } from 'react';
import { FolderOpen, ImageUp } from 'lucide-react';
import { filesFromDrop } from '@/lib/admin/bulkPhotos/folderDrop';

interface Props {
  onFiles: (files: File[]) => void;
  disabled?: boolean;
}

// Chrome, Edge, Firefox and Safari all support choosing a folder this way
const folderProps = { webkitdirectory: '', directory: '' } as Record<string, string>;

/** Choose many photos, a whole folder, or drop them here. Files stay in memory for this page only. */
export default function BulkPhotoPicker({ onFiles, disabled }: Props) {
  const [over, setOver] = useState(false);
  const pick = (list: FileList | null) => list && onFiles(Array.from(list));
  const drop = async (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    if (!disabled) onFiles(await filesFromDrop(e.dataTransfer));
  };

  return (
    <div
      className={`card border-2 border-dashed text-sm text-center space-y-3 ${over ? 'border-brand-500 bg-brand-50' : 'border-gray-200'}`}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={drop}
    >
      <p className="text-gray-600">
        Drop pack photos or a folder here. Name each file after the product&apos;s SKU — <span className="font-mono">PARA-500.jpg</span> is
        the photo for SKU <span className="font-mono">PARA-500</span> (JPEG, PNG or WebP, up to 2 MB).
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        <label className={`btn-outline text-sm inline-flex items-center gap-2 ${disabled ? 'opacity-50' : 'cursor-pointer'}`}>
          <ImageUp className="w-4 h-4" /> Choose photos
          <input
            type="file"
            multiple
            accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
            className="sr-only"
            aria-label="Photo files"
            disabled={disabled}
            onChange={(e) => {
              pick(e.target.files);
              e.target.value = '';
            }}
          />
        </label>
        <label className={`btn-outline text-sm inline-flex items-center gap-2 ${disabled ? 'opacity-50' : 'cursor-pointer'}`}>
          <FolderOpen className="w-4 h-4" /> Choose folder
          <input
            type="file"
            multiple
            className="sr-only"
            aria-label="Photo folder"
            disabled={disabled}
            {...folderProps}
            onChange={(e) => {
              pick(e.target.files);
              e.target.value = '';
            }}
          />
        </label>
      </div>
    </div>
  );
}
