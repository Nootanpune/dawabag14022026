/** Tamper-evident seal number recorded at dispatch (C-26). */
export default function SealNumberField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="block font-medium text-gray-700 mb-1">Seal number</span>
      <input value={value} onChange={(e) => onChange(e.target.value)} maxLength={50} className="input font-mono" />
      <span className="block text-xs text-gray-400 mt-1">
        Close the pack with a tamper-evident seal and enter the number printed on it.
      </span>
    </label>
  );
}
