/** Explicit consent with its purpose (DPDP, C-41). Never ticked for the buyer. */
export default function ConsentBox({ purpose, checked, onChange }: { purpose: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-gray-800" data-testid="health-consent">
      <input type="checkbox" className="mt-1 w-4 h-4" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{purpose}</span>
    </label>
  );
}
