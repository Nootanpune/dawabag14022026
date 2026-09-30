'use client';

export interface H1Values {
  name: string;
  regNo: string;
  secureStorage: boolean;
}

/** Schedule H1 needs a named registered pharmacist and a secure-storage declaration (server rejects without). */
export default function H1DeclarationFields({ value, onChange }: { value: H1Values; onChange: (v: H1Values) => void }) {
  return (
    <fieldset className="border border-amber-200 bg-amber-50 rounded-lg p-3 space-y-2">
      <legend className="text-xs font-semibold text-amber-800 px-1">Schedule H1 declaration (required)</legend>
      <label className="block">
        <span className="block text-xs font-medium text-gray-700 mb-1">Registered pharmacist name</span>
        <input value={value.name} onChange={(e) => onChange({ ...value, name: e.target.value })} className="input" />
      </label>
      <label className="block">
        <span className="block text-xs font-medium text-gray-700 mb-1">Pharmacist registration number</span>
        <input value={value.regNo} onChange={(e) => onChange({ ...value, regNo: e.target.value })} className="input" />
      </label>
      <label className="flex items-start gap-2 text-xs text-gray-700">
        <input
          type="checkbox"
          checked={value.secureStorage}
          onChange={(e) => onChange({ ...value, secureStorage: e.target.checked })}
          className="mt-0.5"
        />
        I declare this medicine is kept in secure storage under the pharmacist named above.
      </label>
    </fieldset>
  );
}
