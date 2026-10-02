'use client';
import Link from 'next/link';
import type { DraftsCreated } from '@/lib/admin/catalogueDrafts';
import Modal from '@/components/admin/Modal';

/** What "Create drafts" did: drafts made, requests grouped or linked, and what is left for a person. */
export default function DraftsCreatedDialog({ result, onClose }: { result: DraftsCreated; onClose: () => void }) {
  return (
    <Modal title="Drafts created" onClose={onClose}>
      <div className="text-sm space-y-2" data-testid="drafts-created">
        <p>
          <strong>{result.drafts_created}</strong> new draft products for <strong>{result.requests_drafted}</strong> requests
          {result.grouped > 0 && <> ({result.grouped} were the same item and share a draft)</>}.
        </p>
        {result.requests_linked > 0 && <p>{result.requests_linked} requests matched a product already on sale and were linked to it.</p>}
        {result.skipped.length > 0 && (
          <div>
            <p className="font-medium">Left for you to handle ({result.skipped.length}):</p>
            <ul className="list-disc pl-5 text-xs text-gray-700">
              {result.skipped.slice(0, 50).map((s) => <li key={s.request_id}>{s.item_name} ({s.partner_name}): {s.reason}</li>)}
            </ul>
          </div>
        )}
        <p className="text-xs text-gray-600">Drafts are not on sale and buyers cannot see them until a pharmacist approves each one.</p>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="btn-outline text-sm">Close</button>
          <Link href="/staff/new-products" className="btn-primary text-sm">Open New products to complete</Link>
        </div>
      </div>
    </Modal>
  );
}
