// Sprint 38: an audit entry written outside a transaction is retried, then fails loudly (C-46)
jest.mock('../config/database', () => ({ query: jest.fn() }));
jest.mock('../config/logger', () => ({ logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn() } }));
import { query } from '../config/database';
import { logger } from '../config/logger';
import { AuditWriteError, writeAudit } from './audit';

const q = query as jest.Mock;

describe('writeAudit outside a transaction', () => {
  beforeEach(() => { q.mockReset(); (logger.error as jest.Mock).mockReset(); });

  it('writes once when the database answers', async () => {
    q.mockResolvedValueOnce([]);
    await writeAudit({ userId: null, action: 'x', newValue: { a: 1 } });
    expect(q).toHaveBeenCalledTimes(1);
    expect(q.mock.calls[0][1]).toEqual([null, 'x', null, '{"a":1}', null, null, null]);
  });

  it('retries a passing failure and succeeds', async () => {
    q.mockRejectedValueOnce(new Error('connection reset')).mockResolvedValueOnce([]);
    await writeAudit({ userId: null, action: 'x' });
    expect(q).toHaveBeenCalledTimes(2);
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('never drops an entry silently: after three failures it logs and throws', async () => {
    q.mockRejectedValue(new Error('database down'));
    await expect(writeAudit({ userId: null, action: 'h1_register_exported' })).rejects.toBeInstanceOf(AuditWriteError);
    expect(q).toHaveBeenCalledTimes(3);
    expect(logger.error).toHaveBeenCalledWith(expect.stringMatching(/h1_register_exported after 3 attempts/));
  });

  it('the error is a plain 503 with a code clients can recognise', () => {
    const e = new AuditWriteError('x');
    expect(e.statusCode).toBe(503);
    expect(e.code).toBe('AUDIT_WRITE_FAILED');
  });
});
