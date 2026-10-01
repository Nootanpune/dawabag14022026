import Link from 'next/link';
import type { FieldErrors, UseFormRegister } from 'react-hook-form';
import type { DetailsFormValues } from '@/lib/registration';
import { LANGUAGE_LABELS, POLICY_LANGUAGES, type PolicyLanguage } from '@/lib/legal/policies';

interface Props {
  register: UseFormRegister<DetailsFormValues>;
  errors: FieldErrors<DetailsFormValues>;
  /** currently chosen notice language (watched by the parent form) */
  noticeLanguage: PolicyLanguage;
}

/** Privacy notice, age and marketing consents — shown for every customer type. */
export default function ConsentFields({ register, errors, noticeLanguage }: Props) {
  const lang = noticeLanguage ?? 'en';
  const noticeHref = lang === 'en' ? '/policies/privacy' : `/policies/privacy?lang=${lang}`;
  return (
    <div className="space-y-3 border-t border-gray-100 pt-4">
      {/* C-40: the notice can be read in English or a scheduled language; the choice is sent with the registration */}
      <label className="flex flex-wrap items-center gap-2 text-sm text-gray-700">
        <span>Read the privacy notice in</span>
        <select {...register('notice_language')} className="input w-auto py-1">
          {POLICY_LANGUAGES.map((l) => (
            <option key={l} value={l} lang={l}>
              {LANGUAGE_LABELS[l]}
            </option>
          ))}
        </select>
      </label>
      <div>
        <label className="flex items-start gap-2 text-sm text-gray-700 cursor-pointer">
          <input
            type="checkbox"
            {...register('accept_privacy_notice')}
            className="mt-0.5 w-4 h-4 accent-brand-600"
          />
          <span>
            I have read the{' '}
            <Link href={noticeHref} target="_blank" className="text-brand-600 font-medium hover:underline">
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
