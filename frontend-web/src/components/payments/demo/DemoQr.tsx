/**
 * A QR-like drawing for the demo "Scan QR" option. It is NOT a QR code and encodes
 * nothing (never a UPI payment link): a fixed pattern with DEMO across it.
 */
const N = 21;
const finder = (x: number, y: number) => {
  const inBox = (ox: number, oy: number) => x >= ox && x < ox + 7 && y >= oy && y < oy + 7;
  for (const [ox, oy] of [[0, 0], [N - 7, 0], [0, N - 7]]) {
    if (inBox(ox, oy)) {
      const dx = x - ox, dy = y - oy;
      return dx === 0 || dy === 0 || dx === 6 || dy === 6 || (dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4) ? 1 : 0;
    }
  }
  return -1;
};
const CELLS: Array<[number, number]> = [];
for (let y = 0; y < N; y++) {
  for (let x = 0; x < N; x++) {
    const f = finder(x, y);
    if (f === 1 || (f === -1 && ((x * 7 + y * 13 + x * y) % 5 < 2))) CELLS.push([x, y]);
  }
}

export default function DemoQr() {
  return (
    <figure className="flex flex-col items-center gap-2">
      <div className="relative">
        <svg viewBox={`-1 -1 ${N + 2} ${N + 2}`} className="w-44 h-44 bg-white border border-gray-200 rounded" role="img"
          aria-label="Demo QR picture — not a real payment code">
          {CELLS.map(([x, y]) => <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill="#374151" />)}
        </svg>
        <span className="absolute inset-0 flex items-center justify-center" aria-hidden="true">
          <span className="rotate-[-20deg] bg-amber-400 text-amber-950 font-extrabold tracking-widest text-lg px-3 py-0.5 rounded shadow">DEMO</span>
        </span>
      </div>
      <figcaption className="text-xs text-gray-600 text-center">Demo picture only — not a real QR. Scanning it does nothing.</figcaption>
    </figure>
  );
}
