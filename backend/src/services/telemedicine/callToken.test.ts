import { rtcToken } from './callToken';

describe('teleconsultation call tokens', () => {
  const env = { ...process.env };
  afterEach(() => { process.env = { ...env }; });
  it('no certificate, no token (the channel name alone never admits anyone)', () => {
    process.env.AGORA_APP_ID = 'a'.repeat(32); delete process.env.AGORA_APP_CERTIFICATE;
    expect(rtcToken('consult_x', 'user-1', 600)).toBeNull();
  });
  it('a signed, expiring token for one channel and one account', () => {
    process.env.AGORA_APP_ID = 'a'.repeat(32); process.env.AGORA_APP_CERTIFICATE = 'b'.repeat(32);
    const t = rtcToken('consult_x', 'user-1', 600)!;
    expect(t.startsWith('007')).toBe(true);
    expect(t).not.toEqual(rtcToken('consult_y', 'user-1', 600));
    expect(t).not.toEqual(rtcToken('consult_x', 'user-2', 600));
  });
});
