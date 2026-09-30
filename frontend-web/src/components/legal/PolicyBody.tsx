/**
 * Renders a policy body (plain text / light markdown) as React text nodes —
 * no HTML is injected. Blank lines separate paragraphs; lines starting with
 * '#' become headings and '- ' / '* ' become list items.
 */
export default function PolicyBody({ body }: { body: string }) {
  const blocks = body.replace(/\r\n/g, '\n').split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);
  return (
    <div className="space-y-3 text-sm text-gray-700 leading-relaxed">
      {blocks.map((block, i) => {
        const heading = block.match(/^(#{1,3})\s+(.*)$/);
        if (heading && !block.includes('\n')) {
          return (
            <h2 key={i} className={heading[1].length === 1 ? 'text-base font-semibold text-gray-900' : 'font-semibold text-gray-900'}>
              {heading[2]}
            </h2>
          );
        }
        const lines = block.split('\n');
        if (lines.every((l) => /^[-*]\s+/.test(l))) {
          return (
            <ul key={i} className="list-disc pl-5 space-y-1">
              {lines.map((l, j) => (
                <li key={j}>{l.replace(/^[-*]\s+/, '')}</li>
              ))}
            </ul>
          );
        }
        return (
          <p key={i} className="whitespace-pre-line">
            {block}
          </p>
        );
      })}
    </div>
  );
}
