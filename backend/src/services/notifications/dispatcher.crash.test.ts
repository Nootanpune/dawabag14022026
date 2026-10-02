// Sprint 32 — a notification deleted while its deliveries are written must not crash
// the API (Sprint 23: FK notification_deliveries_notification_id_fkey → unhandled
// rejection → process exit). Each channel fails on its own, is logged, and the rest go on.
const fkError = Object.assign(new Error('insert or update on table "notification_deliveries" violates foreign key constraint'),
  { code: '23503', constraint: 'notification_deliveries_notification_id_fkey' });
const deliveryWrites: string[] = [];
jest.mock('../../config/database', () => ({
  queryOne: jest.fn(async (sql: string) => (sql.includes('FROM users')
    ? { mobile: '9000000001', email: 'buyer@example.test', deleted_at: null }
    : { id: 'n1' })),
  query: jest.fn(async (sql: string, params: unknown[]) => {
    if (sql.includes('notification_deliveries')) { deliveryWrites.push(String(params[3])); throw fkError; }
    if (sql.includes('user_devices')) { await new Promise((r) => setTimeout(r, 20)); return [{ fcm_token: 't1' }]; }
    return [];
  }),
}));
jest.mock('../../config/logger', () => ({ logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() } }));
// SMS answers at once (its delivery write fails first) while WhatsApp consent is still being read
jest.mock('./channels/sms', () => ({ sendDltSms: jest.fn(async () => ({ status: 'sent' })) }));
jest.mock('./channels/push', () => ({ sendPushTo: jest.fn(async () => [{ status: 'sent' }, { status: 'failed' }]) }));
jest.mock('./channels/whatsapp', () => ({
  sendWhatsApp: jest.fn(async () => ({ status: 'sent' })),
  whatsappOptedIn: jest.fn(() => new Promise((r) => setTimeout(() => r(true), 30))),
}));
jest.mock('./channels/email', () => ({ ...jest.requireActual('./channels/email'), sendEmailMessage: jest.fn(async () => ({ status: 'sent' })) }));

import { dispatchNotification, isNotificationGone, safely } from './dispatcher';
import { logger } from '../../config/logger';

describe('dispatchNotification when the notification disappears mid-dispatch', () => {
  it('resolves, never leaves an unhandled rejection, and logs instead', async () => {
    const unhandled: unknown[] = [];
    const onUnhandled = (r: unknown) => unhandled.push(r);
    process.on('unhandledRejection', onUnhandled);
    try {
      await expect(dispatchNotification({ userId: 'u1', type: 'order_status', orderNumber: 'DB-1', status: 'packed' } as any)).resolves.toBeUndefined();
      await new Promise((r) => setTimeout(r, 50));   // let any stray rejection surface
    } finally {
      process.off('unhandledRejection', onUnhandled);
    }
    expect(unhandled).toEqual([]);
    // every channel still tried its delivery write
    expect(deliveryWrites.sort()).toEqual(expect.arrayContaining(['push', 'sms', 'whatsapp']));
    // the removed notification is a quiet skip, not an error
    expect((logger.info as jest.Mock).mock.calls.some((c) => /removed meanwhile/.test(String(c[0])))).toBe(true);
  });
});

describe('safely', () => {
  it('turns a thrown or rejected channel into a resolved promise, logged as an error', async () => {
    await expect(safely('x', () => { throw new Error('sync'); })).resolves.toBeUndefined();
    await expect(safely('email', async () => { throw new Error('mail server down'); })).resolves.toBeUndefined();
    expect((logger.error as jest.Mock).mock.calls.some((c) => /email failed/.test(String(c[0])))).toBe(true);
  });
  it('recognises the deleted-notification FK error only', () => {
    expect(isNotificationGone(fkError)).toBe(true);
    expect(isNotificationGone({ code: '23505' })).toBe(false);
    expect(isNotificationGone(new Error('x'))).toBe(false);
  });
});
