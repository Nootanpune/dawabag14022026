import { PRACTITIONER_DECLARATION_TEXT } from '@/lib/checkout';

/** Doctors / hospitals confirm on every order; starts unticked (C-15). */
export default function PractitionerDeclaration({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-start gap-2 text-sm text-gray-800 bg-amber-50 border border-amber-200 rounded-lg p-3 cursor-pointer">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 w-4 h-4 accent-brand-600" />
      <span>{PRACTITIONER_DECLARATION_TEXT}.</span>
    </label>
  );
}
