// Sprint 32 — an unhandled rejection is fatal only while the API starts
jest.mock('./logger', () => ({ logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() } }));
import { unhandledRejectionHandler } from './processGuards';
import { logger } from './logger';

describe('unhandledRejection handler', () => {
  it('stops the process (exit 1) while starting — a failed start must not look healthy', () => {
    const exit = jest.fn();
    unhandledRejectionHandler({ started: false }, exit)(new Error('database refused'));
    expect(exit).toHaveBeenCalledWith(1);
  });
  it('logs and keeps serving once started', () => {
    const exit = jest.fn();
    const err = new Error('insert or update on table "notification_deliveries" violates foreign key constraint');
    unhandledRejectionHandler({ started: true }, exit)(err);
    expect(exit).not.toHaveBeenCalled();
    expect((logger.error as jest.Mock).mock.calls.at(-1)?.[1]).toBe(err);
  });
});
