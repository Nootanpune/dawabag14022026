'use client';
import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import api, { getApiErrorMessage, getApiFieldErrors, type AuthResponseData } from '@/lib/api';
import { useAuthStore } from '@/store/authStore';
import {
  buildRegisterPayload,
  EMPTY_DETAILS,
  getOptionalDocuments,
  getRequiredDocuments,
  type CustomerType,
  type DetailsFormValues,
  type DocumentType,
  type RegisterResponseData,
} from '@/lib/registration';
import StepIndicator from '@/components/auth/register/StepIndicator';
import CustomerTypeStep from '@/components/auth/register/CustomerTypeStep';
import DetailsStep from '@/components/auth/register/DetailsStep';
import DocumentsStep, { type HeldFiles } from '@/components/auth/register/DocumentsStep';
import OtpStep from '@/components/auth/register/OtpStep';
import KycUploadStep from '@/components/auth/register/KycUploadStep';
import SubmittedScreen from '@/components/auth/register/SubmittedScreen';
import AuthShell from '@/components/auth/AuthShell';

type Step = 'type' | 'details' | 'documents' | 'otp' | 'upload' | 'submitted';

export default function RegisterPage() {
  const router = useRouter();
  const { login, setKycStatus } = useAuthStore();

  const [step, setStep] = useState<Step>('type');
  const [customerType, setCustomerType] = useState<CustomerType | null>(null);
  const [details, setDetails] = useState<DetailsFormValues>(EMPTY_DETAILS);
  const [files, setFiles] = useState<HeldFiles>({});
  const [registration, setRegistration] = useState<RegisterResponseData | null>(null);
  const [accessToken, setAccessToken] = useState('');
  const [documentsIncomplete, setDocumentsIncomplete] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const isB2C = customerType === 'customer';
  const stepLabels = isB2C
    ? ['Account type', 'Details', 'Verify']
    : ['Account type', 'Details', 'Documents', 'Verify'];
  const stepIndex = { type: 0, details: 1, documents: 2, otp: stepLabels.length - 1, upload: stepLabels.length - 1, submitted: stepLabels.length }[step];

  const goTo = (next: Step) => {
    setFormError('');
    setStep(next);
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // ─── POST /auth/register ──────────────────────────────────────────────────
  const register = async (type: CustomerType, values: DetailsFormValues): Promise<boolean> => {
    setIsSubmitting(true);
    setFormError('');
    setFieldErrors({});
    try {
      const res = await api.post('/auth/register', buildRegisterPayload(type, values));
      const data: RegisterResponseData = res.data.data;
      setRegistration({
        ...data,
        mobile: data?.mobile || values.mobile.trim(),
        required_documents: Array.isArray(data?.required_documents)
          ? data.required_documents
          : getRequiredDocuments(type, !!values.gstin.trim()),
      });
      toast.success(`OTP sent to +91 ${values.mobile.trim()}`);
      return true;
    } catch (err: any) {
      const msg =
        err?.response?.status === 409
          ? getApiErrorMessage(err, 'This mobile number is already registered. Please sign in.')
          : getApiErrorMessage(err, 'Registration failed');
      const fe = getApiFieldErrors(err);
      setFormError(msg);
      setFieldErrors(fe);
      toast.error(msg);
      // Field-level problems can only be fixed on the details step.
      if (Object.keys(fe).length && step !== 'details') setStep('details');
      return false;
    } finally {
      setIsSubmitting(false);
    }
  };

  // ─── Step handlers ────────────────────────────────────────────────────────
  const onSelectType = (type: CustomerType) => {
    if (type !== customerType) setFiles({});
    setCustomerType(type);
    setFieldErrors({});
    goTo('details');
  };

  const onDetailsSubmit = async (values: DetailsFormValues) => {
    if (!customerType) return;
    setDetails(values);
    if (customerType === 'customer') {
      if (await register(customerType, values)) goTo('otp');
    } else {
      // Drop a held GST certificate if a retailer removed their GSTIN.
      const allowed = new Set<DocumentType>([
        ...getRequiredDocuments(customerType, !!values.gstin.trim()),
        ...getOptionalDocuments(customerType),
      ]);
      setFiles((prev) =>
        Object.fromEntries(Object.entries(prev).filter(([d]) => allowed.has(d as DocumentType))) as HeldFiles
      );
      goTo('documents');
    }
  };

  const onDocumentsContinue = async () => {
    if (!customerType) return;
    if (registration) return goTo('otp'); // already registered — just return to OTP
    if (await register(customerType, details)) goTo('otp');
  };

  const onOtpVerified = async (data: AuthResponseData) => {
    login(data);
    if (customerType === 'customer' || registration?.kyc_required === false) {
      toast.success('Welcome to Dawabag!');
      router.push('/');
      return;
    }
    toast.success('Mobile verified');
    setAccessToken(data.access_token);
    goTo('upload');
  };

  const onUploadComplete = useCallback(
    (kycStatus?: string) => {
      if (kycStatus) setKycStatus(kycStatus);
      setDocumentsIncomplete(false);
      setStep('submitted');
    },
    [setKycStatus]
  );

  // ─── Render ───────────────────────────────────────────────────────────────
  const requiredDocs = customerType ? getRequiredDocuments(customerType, !!details.gstin.trim()) : [];
  const optionalDocs = customerType ? getOptionalDocuments(customerType) : [];

  return (
    <AuthShell title="Create account" subtitle="Join Dawabag today" wide>
          {step !== 'submitted' && <StepIndicator steps={stepLabels} current={stepIndex} />}

          {formError && (step === 'details' || step === 'documents') && (
            <div className="mb-4 flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{formError}</span>
            </div>
          )}

          {step === 'type' && <CustomerTypeStep selected={customerType} onSelect={onSelectType} />}

          {step === 'details' && customerType && (
            <DetailsStep
              key={customerType}
              customerType={customerType}
              defaultValues={details}
              serverErrors={fieldErrors}
              isSubmitting={isSubmitting}
              submitLabel={isB2C ? 'Continue & send OTP' : 'Continue'}
              onBack={(values) => {
                setDetails(values);
                goTo('type');
              }}
              onSubmit={onDetailsSubmit}
            />
          )}

          {step === 'documents' && customerType && (
            <DocumentsStep
              requiredDocs={requiredDocs}
              optionalDocs={optionalDocs}
              files={files}
              onChange={(d, f) =>
                setFiles((prev) => {
                  const next = { ...prev };
                  if (f) next[d] = f;
                  else delete next[d];
                  return next;
                })
              }
              onBack={registration ? undefined : () => goTo('details')}
              onContinue={onDocumentsContinue}
              isSubmitting={isSubmitting}
            />
          )}

          {step === 'otp' && registration && (
            <OtpStep
              mobile={registration.mobile}
              onVerified={onOtpVerified}
              onBack={isB2C ? undefined : () => goTo('documents')}
            />
          )}

          {step === 'upload' && registration && accessToken && (
            <KycUploadStep
              requiredDocs={registration.required_documents}
              files={files}
              accessToken={accessToken}
              onComplete={onUploadComplete}
              onSkip={() => {
                setDocumentsIncomplete(true);
                setStep('submitted');
              }}
            />
          )}

          {step === 'submitted' && customerType && (
            <SubmittedScreen customerType={customerType} documentsIncomplete={documentsIncomplete} />
          )}

          {(step === 'type' || step === 'details') && (
            <p className="text-center text-sm text-gray-500 mt-4">
              Already have an account?{' '}
              <Link href="/auth/login" className="text-brand-600 font-medium hover:underline">
                Sign in
              </Link>
            </p>
          )}
    </AuthShell>
  );
}
