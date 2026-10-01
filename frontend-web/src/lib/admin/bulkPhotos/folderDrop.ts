// Collects the files from a drag-and-drop: plain files, or the files inside a
// dropped folder (and its sub-folders). Reads only what the user dropped.

type Entry = { isFile: boolean; isDirectory: boolean; name: string };
type FileEntry = Entry & { file: (ok: (f: File) => void, fail: (e: unknown) => void) => void };
type DirEntry = Entry & { createReader: () => { readEntries: (ok: (e: Entry[]) => void, fail: (e: unknown) => void) => void } };

const fileOf = (e: FileEntry) => new Promise<File>((ok, fail) => e.file(ok, fail));

async function readDir(dir: DirEntry): Promise<Entry[]> {
  const reader = dir.createReader();
  const all: Entry[] = [];
  // readEntries returns the folder in chunks until it returns an empty list
  for (;;) {
    const chunk = await new Promise<Entry[]>((ok, fail) => reader.readEntries(ok, fail));
    if (!chunk.length) return all;
    all.push(...chunk);
  }
}

async function walk(entry: Entry, depth: number): Promise<File[]> {
  if (entry.isFile) return [await fileOf(entry as FileEntry)];
  if (!entry.isDirectory || depth > 5) return [];
  const children = await readDir(entry as DirEntry);
  return (await Promise.all(children.map((c) => walk(c, depth + 1)))).flat();
}

export async function filesFromDrop(dt: DataTransfer): Promise<File[]> {
  const entries = Array.from(dt.items ?? [])
    .map((i) => (i.kind === 'file' && 'webkitGetAsEntry' in i ? (i.webkitGetAsEntry() as Entry | null) : null))
    .filter((e): e is Entry => !!e);
  if (!entries.length) return Array.from(dt.files ?? []);
  return (await Promise.all(entries.map((e) => walk(e, 0)))).flat();
}
