// Admins are told once when a scheduled job starts failing, not on every failed run
jest.mock('../config/database', () => ({ query: jest.fn(), queryOne: jest.fn() }));
jest.mock('../config/redis', () => ({ getRedis: jest.fn() }));
jest.mock('../config/logger', () => ({ logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() } }));
jest.mock('../services/notification.service', () => ({ queueNotification: jest.fn() }));
jest.mock('./registry', () => ({ JOBS: [] }));

import { query, queryOne } from '../config/database';
import { queueNotification } from '../services/notification.service';
import { alertFirstFailure } from './scheduler';

const q = query as jest.Mock, q1 = queryOne as jest.Mock, notify = queueNotification as jest.Mock;

describe('job failure alerts', () => {
  beforeEach(() => { jest.resetAllMocks(); q.mockResolvedValue([{ id: 'a1' }, { id: 'a2' }]); });

  it('alerts every admin when a job that was working fails', async () => {
    q1.mockResolvedValue({ status: 'succeeded' });
    expect(await alertFirstFailure('refill_orders', 'r2', 'connection refused')).toBe(true);
    expect(notify).toHaveBeenCalledTimes(2);
    expect(notify.mock.calls[0][0]).toMatchObject({ userId: 'a1', type: 'job_failed', reportNo: 'refill_orders', reason: 'connection refused' });
  });

  it('alerts on the very first run too', async () => {
    q1.mockResolvedValue(null);
    expect(await alertFirstFailure('recall_alert_watch', 'r1', 'boom')).toBe(true);
  });

  it('stays quiet while the job keeps failing', async () => {
    q1.mockResolvedValue({ status: 'failed' });
    expect(await alertFirstFailure('refill_orders', 'r3', 'connection refused')).toBe(false);
    expect(notify).not.toHaveBeenCalled();
  });
});
