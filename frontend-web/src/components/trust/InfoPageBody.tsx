import { toBlocks } from '@/lib/infoPages/blocks';

/** A trust page's text as headings, paragraphs and lists — never raw HTML. */
export default function InfoPageBody({ body }: { body: string }) {
  return (
    <div className="space-y-3 text-sm text-gray-800 leading-relaxed">
      {toBlocks(body).map((b, i) => {
        if (b.kind === 'heading') return <h2 key={i} className="text-base font-semibold text-gray-900 pt-2">{b.text}</h2>;
        if (b.kind === 'list') return <ul key={i} className="list-disc pl-5 space-y-1">{b.items.map((x, j) => <li key={j}>{x}</li>)}</ul>;
        return <p key={i}>{b.text}</p>;
      })}
    </div>
  );
}
