// Turns a trust page's plain text into blocks to render (Sprint 33): a blank line
// starts a new paragraph, "## " is a heading and "- " a list item. No HTML is
// ever taken from the text, so nothing an admin types can run in the browser.

export type Block =
  | { kind: 'heading'; text: string }
  | { kind: 'paragraph'; text: string }
  | { kind: 'list'; items: string[] };

export function toBlocks(body: string): Block[] {
  const blocks: Block[] = [];
  let para: string[] = [];
  let list: string[] | null = null;
  const flush = () => {
    if (para.length) blocks.push({ kind: 'paragraph', text: para.join(' ') });
    if (list) blocks.push({ kind: 'list', items: list });
    para = [];
    list = null;
  };
  for (const raw of body.replace(/\r\n/g, '\n').split('\n')) {
    const line = raw.trim();
    if (!line) { flush(); continue; }
    if (line.startsWith('## ')) { flush(); blocks.push({ kind: 'heading', text: line.slice(3).trim() }); continue; }
    if (line.startsWith('- ')) {
      if (para.length) { blocks.push({ kind: 'paragraph', text: para.join(' ') }); para = []; }
      (list ??= []).push(line.slice(2).trim());
      continue;
    }
    if (list) { blocks.push({ kind: 'list', items: list }); list = null; }
    para.push(line);
  }
  flush();
  return blocks;
}
