import { DEFAULT_QUEUE_PREFIX, queueOptions, queuePrefix, queuePrefixProblem } from './queues';

// Sprint 47: each deployment's job queues apart on a shared Redis (the Sprint 8 smoke flake)
describe('job queue prefix', () => {
  it('defaults to Bull\'s own prefix, so existing servers keep their waiting jobs', () => {
    expect(queuePrefix({})).toBe(DEFAULT_QUEUE_PREFIX);
    expect(queuePrefix({ QUEUE_PREFIX: '  ' })).toBe('bull');
  });
  it('uses QUEUE_PREFIX when set, for every queue', () => {
    expect(queuePrefix({ QUEUE_PREFIX: 'dawabag-api-4310' })).toBe('dawabag-api-4310');
    expect(queueOptions({ QUEUE_PREFIX: 'trial', REDIS_URL: 'redis://r:6379' })).toEqual({ prefix: 'trial', redis: 'redis://r:6379' });
  });
  it('refuses odd characters at start-up', () => {
    expect(queuePrefixProblem({ QUEUE_PREFIX: 'ok:stack_1.a-b' })).toBeNull();
    expect(queuePrefixProblem({ QUEUE_PREFIX: 'bad prefix*' })).toMatch(/QUEUE_PREFIX/);
    expect(queuePrefixProblem({})).toBeNull();
  });
});
