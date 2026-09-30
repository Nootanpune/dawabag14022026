'use client';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useForm, type UseFormRegisterReturn } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { Eye, EyeOff, Loader2, ArrowLeft, ArrowRight } from 'lucide-react';
import {
  buildDetailsSchema,
  getCustomerTypeOption,
  GST_DECLARATION_TEXT,
  RETAILER_DL_TYPES,
  SPECIALITIES,
  WHOLESALER_DL_TYPES,
  type CustomerType,
  type DetailsFormValues,
} from '@/lib/registration';

interface Props {
  customerType: CustomerType;
  defaultValues: DetailsFormValues;
  /** field → message, from a server validation error */
  serverErrors?: Record<string, string>;
  isSubmitting: boolean;
  submitLabel: string;
  /** receives the current (unvalidated) values so they survive going back */
  onBack: (values: DetailsFormValues) => void;
  onSubmit: (values: DetailsFormValues) => void | Promise<void>;
}

function Field({
  label,
  optional,
  error,
  hint,
  children,
}: {
  label: string;
  optional?: boolean;
  error?: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {label} {optional && <span className="text-gray-400">(optional)</span>}
      </label>
      {children}
      {hint && !error && <p className="text-xs text-gray-400 mt-1">{hint}</p>}
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </div>
  );
}

/** Wraps a registered input so typed text is upper-cased (PAN, GSTIN). */
function upper(reg: UseFormRegisterReturn): UseFormRegisterReturn {
  return {
    ...reg,
    onChange: (e) => {
      const target = e.target as HTMLInputElement;
      target.value = target.value.toUpperCase();
      return reg.onChange(e);
    },
  };
}

export default function DetailsStep({
  customerType,
  defaultValues,
  serverErrors,
  isSubmitting,
  submitLabel,
  onBack,
  onSubmit,
}: Props) {
  const [showPassword, setShowPassword] = useState(false);
  const schema = useMemo(() => buildDetailsSchema(customerType), [customerType]);
  const {
    register,
    handleSubmit,
    watch,
    getValues,
    setError,
    formState: { errors },
  } = useForm<DetailsFormValues>({ resolver: zodResolver(schema), defaultValues });

  useEffect(() => {
    if (!serverErrors) return;
    for (const [field, message] of Object.entries(serverErrors)) {
      if (field in defaultValues) setError(field as keyof DetailsFormValues, { type: 'server', message });
    }
  }, [serverErrors, setError, defaultValues]);

  const isB2B = customerType === 'b2b_retailer' || customerType === 'b2b_wholesaler';
  const isDoctor = customerType === 'doc_hospital';
  const gstin = watch('gstin');
  const showDeclaration = isDoctor || (customerType === 'b2b_retailer' && !gstin?.trim());
  const dlTypes = customerType === 'b2b_wholesaler' ? WHOLESALER_DL_TYPES : RETAILER_DL_TYPES;
  const option = getCustomerTypeOption(customerType);

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      <div>
        <h2 className="text-lg font-semibold">Your details</h2>
        <p className="text-sm text-gray-500 mt-0.5">{option.label}</p>
      </div>

      {/* ── Business / professional section ── */}
      {isB2B && (
        <>
          <Field label="Business name" error={errors.business_name?.message}>
            <input {...register('business_name')} placeholder="Shah Medical Stores" className="input" />
          </Field>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Drug license type" error={errors.drug_license_type?.message}>
              <select {...register('drug_license_type')} className="input">
                <option value="">Select</option>
                {dlTypes.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Drug license number" error={errors.drug_license_number?.message}>
              <input {...register('drug_license_number')} placeholder="MH-NSK-123456" className="input" />
            </Field>
          </div>
        </>
      )}

      {isDoctor && (
        <>
          <Field label="NMC / Council registration number" error={errors.nmc_reg_number?.message}>
            <input {...register('nmc_reg_number')} placeholder="e.g. 2011/05/1234" className="input" />
          </Field>
          <Field label="Medical council" error={errors.nmc_council_state?.message}>
            <input
              {...register('nmc_council_state')}
              placeholder="Maharashtra Medical Council"
              className="input"
            />
          </Field>
          <Field label="Speciality" error={errors.speciality?.message}>
            <select {...register('speciality')} className="input">
              <option value="">Select</option>
              {SPECIALITIES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </Field>
        </>
      )}

      {/* ── Contact person ── */}
      <Field
        label={isDoctor ? 'Full name (as registered)' : isB2B ? 'Contact person name' : 'Full name'}
        error={errors.full_name?.message}
        hint={isDoctor ? 'Include "Dr." exactly as on your registration certificate' : undefined}
      >
        <input
          {...register('full_name')}
          placeholder={isDoctor ? 'Dr. Rajesh Shah' : 'Rajesh Shah'}
          className="input"
        />
      </Field>

      <Field label="Mobile number" error={errors.mobile?.message}>
        <div className="flex">
          <span className="inline-flex items-center px-3 rounded-l-lg border border-r-0 border-gray-300 bg-gray-50 text-gray-500 text-sm">
            +91
          </span>
          <input
            {...register('mobile')}
            type="tel"
            inputMode="numeric"
            maxLength={10}
            placeholder="9876543210"
            className="input rounded-l-none"
          />
        </div>
      </Field>

      <Field
        label="Email"
        optional={!isB2B}
        error={errors.email?.message}
        hint={isB2B ? 'Tax invoices are emailed to this address' : undefined}
      >
        <input {...register('email')} type="email" placeholder="rajesh@example.com" className="input" />
      </Field>

      <Field label="Pincode" optional={customerType === 'customer'} error={errors.pincode?.message}>
        <input
          {...register('pincode')}
          inputMode="numeric"
          maxLength={6}
          placeholder="422001"
          className="input"
        />
      </Field>

      {/* ── Tax identity ── */}
      {customerType !== 'customer' && (
        <Field label="PAN" error={errors.pan_number?.message}>
          <input
            {...upper(register('pan_number'))}
            maxLength={10}
            placeholder="ABCDE1234F"
            className="input uppercase"
          />
        </Field>
      )}

      {isB2B && (
        <Field
          label="GSTIN"
          optional={customerType === 'b2b_retailer'}
          error={errors.gstin?.message}
          hint={customerType === 'b2b_retailer' ? 'Leave blank if your business is not GST-registered' : undefined}
        >
          <input
            {...upper(register('gstin'))}
            maxLength={15}
            placeholder="27ABCDE1234F1Z5"
            className="input uppercase"
          />
        </Field>
      )}

      {showDeclaration && (
        <div>
          <label className="flex items-start gap-2 text-sm text-gray-700 cursor-pointer">
            <input
              type="checkbox"
              {...register('gst_unregistered_declaration')}
              className="mt-0.5 w-4 h-4 accent-brand-600"
            />
            <span>{GST_DECLARATION_TEXT[customerType]}</span>
          </label>
          {errors.gst_unregistered_declaration && (
            <p className="text-xs text-red-500 mt-1">{errors.gst_unregistered_declaration.message}</p>
          )}
        </div>
      )}

      {/* ── Credentials ── */}
      <Field label="Password" error={errors.password?.message}>
        <div className="relative">
          <input
            {...register('password')}
            type={showPassword ? 'text' : 'password'}
            placeholder="Min. 8 characters"
            className="input pr-10"
            autoComplete="new-password"
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"
            aria-label={showPassword ? 'Hide password' : 'Show password'}
          >
            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
      </Field>

      <Field label="Confirm password" error={errors.confirm_password?.message}>
        <input
          {...register('confirm_password')}
          type="password"
          placeholder="Re-enter password"
          className="input"
          autoComplete="new-password"
        />
      </Field>

      <Field label="Referral code" optional>
        <input {...register('referral_code')} placeholder="e.g. RAJA20" className="input uppercase" />
      </Field>

      {/* ── Consents ── */}
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
              <Link href="/privacy" target="_blank" className="text-brand-600 font-medium hover:underline">
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

      <div className="flex gap-3 pt-1">
        <button
          type="button"
          onClick={() => onBack(getValues())}
          disabled={isSubmitting}
          className="btn-outline flex items-center justify-center gap-1.5 py-2.5"
        >
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        <button
          type="submit"
          disabled={isSubmitting}
          className="btn-primary flex-1 py-2.5 flex items-center justify-center gap-2"
        >
          {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
          {submitLabel}
        </button>
      </div>
    </form>
  );
}
