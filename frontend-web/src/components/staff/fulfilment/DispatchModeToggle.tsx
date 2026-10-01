export type DispatchMode = 'courier' | 'rider';

/** "Our rider" or a courier — never both; the server refuses both together (400). */
export default function DispatchModeToggle({ value, onChange }: { value: DispatchMode; onChange: (m: DispatchMode) => void }) {
  const option = (m: DispatchMode, label: string) => (
    <label className="flex items-center gap-2 cursor-pointer">
      <input type="radio" name="dispatch-mode" checked={value === m} onChange={() => onChange(m)} />
      {label}
    </label>
  );
  return (
    <fieldset className="flex flex-wrap gap-4">
      <legend className="sr-only">Who takes the parcel</legend>
      {option('rider', 'Our rider')}
      {option('courier', 'Courier')}
    </fieldset>
  );
}
