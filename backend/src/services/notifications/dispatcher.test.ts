// Email bodies are plain text: words from staff or a provider (a rejection reason, a
// failing job's error) must not become markup or a link in a mail from Dawabag (C-41)
jest.mock('../../config/database', () => ({
  queryOne: jest.fn(async (sql: string) => (sql.includes('FROM users')
    ? { mobile: '9000000001', email: 'admin@dawabag.in', deleted_at: null }
    : { id: 'n1' })),
  query: jest.fn(async () => []),
}));
jest.mock('./channels/sms', () => ({ sendDltSms: jest.fn(async () => ({ status: 'skipped' })) }));
jest.mock('./channels/push', () => ({ sendPushTo: jest.fn(async () => []) }));
jest.mock('./channels/whatsapp', () => ({ sendWhatsApp: jest.fn(), whatsappOptedIn: jest.fn(async () => false) }));
jest.mock('./channels/email', () => ({
  ...jest.requireActual('./channels/email'),
  sendEmailMessage: jest.fn(async () => ({ status: 'sent' })),
}));

import { dispatchNotification } from './dispatcher';
import { sendEmailMessage } from './channels/email';

describe('dispatchNotification email body', () => {
  it('escapes provider- or staff-supplied text before it goes into the HTML mail', async () => {
    await dispatchNotification({ userId: 'u1', type: 'job_failed', reportNo: 'refills',
      reason: '<a href="https://evil.example">Click to fix</a>' } as any);
    const body = (sendEmailMessage as jest.Mock).mock.calls[0][2] as string;
    expect(body).not.toContain('<a ');
    expect(body).toContain('&lt;a href=&quot;https://evil.example&quot;&gt;');
  });
});
