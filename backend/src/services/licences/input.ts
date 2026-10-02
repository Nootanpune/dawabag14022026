// Request shape of a drug licence, shared by every API that takes licences (partner
// onboarding, suppliers, buyer sign-up and account, admin KYC review). Accepts the form
// as printed ("20", "Form 21B", "25A") or as our code (dl20b), under `form` or the older
// Sprint 28 name `licence_type`. The rules (required kinds, expiry, duplicates) are in
// forms.licenceProblems and register.assertNumbersFree, with plain messages.
import { z } from 'zod';
import { LICENCE_FORMS, LicenceIn, normaliseForm } from './forms';

const optionalText = (max: number) => z.string().trim().max(max).optional().nullable()
  .transform((v) => (v ? v : null));
const optionalDate = z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Enter dates as YYYY-MM-DD'), z.literal('')]).optional().nullable()
  .transform((v) => (v ? v : null));

export const licenceInput = z.preprocess(
  (v) => {
    if (!v || typeof v !== 'object') return v;
    const o = v as Record<string, unknown>;
    const raw = o.form ?? o.licence_type;
    return { ...o, form: normaliseForm(raw) ?? raw };
  },
  z.object({
    form: z.enum(LICENCE_FORMS, { errorMap: () => ({ message: 'Choose the licence form (20, 21, 20B, 21B, 25, 28 … or Other)' }) }),
    form_name: optionalText(80),
    licence_number: z.string({ required_error: 'Enter the licence number' }).trim().min(3, 'Enter the licence number')
      .max(100, 'The licence number is too long'),
    issued_by: optionalText(200),
    valid_from: optionalDate,
    valid_upto: optionalDate,
  }),
) as unknown as z.ZodType<LicenceIn>;

export const licenceList = (max = 20) => z.array(licenceInput).max(max, `Enter at most ${max} licences`);
