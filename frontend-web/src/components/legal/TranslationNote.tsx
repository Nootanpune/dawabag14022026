import { LANGUAGE_NAMES, type PolicyDoc } from '@/lib/legal/policies';

/** Shown when the server fell back to English because the translation is not published yet (C-40). */
export default function TranslationNote({ doc }: { doc: Pick<PolicyDoc, 'requested_language' | 'translation_available'> }) {
  if (doc.translation_available !== false || !doc.requested_language || doc.requested_language === 'en') return null;
  return (
    <p className="text-xs text-amber-700 bg-amber-50 rounded px-2 py-1 mb-3">
      Not yet available in {LANGUAGE_NAMES[doc.requested_language]}; showing English.
    </p>
  );
}
