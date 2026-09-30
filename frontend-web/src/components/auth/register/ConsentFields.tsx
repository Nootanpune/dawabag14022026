import Link from 'next/link';
import type { FieldErrors, UseFormRegister } from 'react-hook-form';
import type { DetailsFormValues } from '@/lib/registration';

interface Props {
  register: UseFormRegister<DetailsFormValues>;
  errors: FieldErrors<DetailsFormValues>;
}

/** Privacy notice, age and marketing consents — shown for every customer type. */
export default function ConsentFields({ register, errors }: Props) {
  return (
    <div className="space-y-3 border-t border-gray-100 pt-4">
      <div>
        <label className="flex items-start gap-2 text-sm text-gray-700 cursor-pointer">
          <input
            type="checkbox"
            {...register('accept_privacy_notice')}
            className="mt-0.5 w-4 h-4 accent-brand-600"
          />
          <span>
            I have read the{' '}
            <Link href="/policies/privacy" target="_blank" className="text-brand-600 font-medium hover:underline">
              Privacy Notice
            </Link>{' '}
            and agree to Dawabag processing my personal and health data to provide pharmacy services.
          </span>
        </label>
        {errors.accept_privacy_notice && (
          <p className="text-xs text-red-500 mt-1">{errors.accept_privacy_notice.message}</p>
        )}
      </div>
      <div>
        <label className="flex items-start gap-2 text-sm text-gray-700 cursor-pointer">
          <input type="checkbox" {...register('age_confirmed')} className="mt-0.5 w-4 h-4 accent-brand-600" />
          <span>I confirm I am 18 years or older.</span>
        </label>
        {errors.age_confirmed && <p className="text-xs text-red-500 mt-1">{errors.age_confirmed.message}</p>}
      </div>
      <label className="flex items-start gap-2 text-sm text-gray-700 cursor-pointer">
        <input type="checkbox" {...register('marketing_consent')} className="mt-0.5 w-4 h-4 accent-brand-600" />
        <span>Send me offers and health reminders by SMS/email (optional).</span>
      </label>
    </div>
  );
}
