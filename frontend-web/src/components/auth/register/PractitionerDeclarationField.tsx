import type { UseFormRegister } from 'react-hook-form';
import { PRACTITIONER_REGISTRATION_TEXT, type DetailsFormValues } from '@/lib/registrationForm';

/** Doctor / hospital own-patients declaration (C-15); unticked by default, required by the server. */
export default function PractitionerDeclarationField({
  register,
  error,
}: {
  register: UseFormRegister<DetailsFormValues>;
  error?: string;
}) {
  return (
    <div>
      <label className="flex items-start gap-2 text-sm text-gray-700 cursor-pointer">
        <input type="checkbox" {...register('practitioner_declaration')} className="mt-0.5 w-4 h-4 accent-brand-600" />
        <span>{PRACTITIONER_REGISTRATION_TEXT}</span>
      </label>
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </div>
  );
}
