import { LANGUAGE_LABELS, POLICY_LANGUAGES, type PolicyLanguage } from '@/lib/legal/policies';

interface Props {
  value: PolicyLanguage;
  onChange: (lang: PolicyLanguage) => void;
  className?: string;
}

/** English / मराठी / हिंदी choice for reading a policy (C-40). Not stored anywhere. */
export default function PolicyLanguageSwitcher({ value, onChange, className = '' }: Props) {
  return (
    <div role="group" aria-label="Language" className={`inline-flex rounded-md border border-gray-200 overflow-hidden text-xs ${className}`}>
      {POLICY_LANGUAGES.map((l) => (
        <button
          key={l}
          type="button"
          lang={l}
          aria-pressed={value === l}
          onClick={() => onChange(l)}
          className={`px-3 py-1 ${value === l ? 'bg-brand-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
        >
          {LANGUAGE_LABELS[l]}
        </button>
      ))}
    </div>
  );
}
