import { DEMO_PROVIDERS, demoPaymentsEnabled, demoProviderValid, isDemoPaymentId, paymentMode } from './paymentMode';

describe('payment mode (Sprint 26)', () => {
  const trial = { APP_ENV: 'trial' } as NodeJS.ProcessEnv;
  const keys = { RAZORPAY_KEY_ID: 'rzp_test_1', RAZORPAY_KEY_SECRET: 's' };
  it('a trial without Razorpay keys takes demo payments', () => {
    expect(paymentMode(trial)).toBe('demo');
    expect(demoPaymentsEnabled(trial)).toBe(true);
  });
  it('Razorpay keys always win: Checkout opens, never the demo', () => {
    expect(paymentMode({ ...trial, ...keys } as any)).toBe('razorpay');
    expect(demoPaymentsEnabled({ ...trial, ...keys } as any)).toBe(false);
    expect(paymentMode({ APP_ENV: 'production', ...keys } as any)).toBe('razorpay');
  });
  it('never a demo outside APP_ENV=trial, whatever DEMO_PAYMENTS says', () => {
    for (const APP_ENV of ['production', 'staging', 'development', 'test', undefined]) {
      expect(paymentMode({ APP_ENV, DEMO_PAYMENTS: 'true' } as any)).toBe('unavailable');
      expect(demoPaymentsEnabled({ APP_ENV, DEMO_PAYMENTS: 'true' } as any)).toBe(false);
    }
  });
  it('DEMO_PAYMENTS=false turns the demo off on a trial', () => {
    expect(paymentMode({ ...trial, DEMO_PAYMENTS: 'false' } as any)).toBe('unavailable');
  });
  it('recognises demo payment ids', () => {
    expect(isDemoPaymentId('demo_pay_ab12')).toBe(true);
    expect(isDemoPaymentId('pay_ab12')).toBe(false);
    expect(isDemoPaymentId(null)).toBe(false);
  });
  it('demo checkout: a listed bank or wallet only, and nothing named for UPI or cards (Sprint 27)', () => {
    expect(DEMO_PROVIDERS.netbanking).toEqual(['SBI', 'HDFC', 'ICICI', 'Axis', 'Kotak']);
    expect(demoProviderValid('netbanking', 'HDFC')).toBe(true);
    expect(demoProviderValid('wallet', 'Amazon Pay')).toBe(true);
    expect(demoProviderValid('wallet', undefined)).toBe(true);
    expect(demoProviderValid('netbanking', 'Paytm')).toBe(false);
    expect(demoProviderValid('wallet', 'Some Bank')).toBe(false);
    expect(demoProviderValid('card', '4111111111111111')).toBe(false);
    expect(demoProviderValid('upi', 'demo@upi')).toBe(false);
    expect(demoProviderValid('upi', undefined)).toBe(true);
  });
});
