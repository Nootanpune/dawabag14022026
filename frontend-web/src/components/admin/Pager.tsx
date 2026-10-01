'use client';

/** Previous / next for a server-paged list that reports its total. Renders nothing for a single page. */
export default function Pager({ page, limit, total, onPage }: { page: number; limit: number; total: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / limit));
  if (pages <= 1 && page <= 1) return null;
  return (
    <div className="flex justify-end items-center gap-2 mt-3 text-sm">
      <button disabled={page <= 1} onClick={() => onPage(page - 1)} className="btn-outline text-xs py-1 px-3 disabled:opacity-40">
        Previous
      </button>
      <span className="text-gray-500">
        Page {page} of {pages} · {total} total
      </span>
      <button disabled={page >= pages} onClick={() => onPage(page + 1)} className="btn-outline text-xs py-1 px-3 disabled:opacity-40">
        Next
      </button>
    </div>
  );
}
