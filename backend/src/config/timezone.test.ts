// The API process runs in UTC on any host, so DATE columns (parsed as local midnight)
// keep their calendar day when read back with toISOString() (C-08, C-27).
// (Jest sandboxes process.env, so this checks the setting, not the clock.)
describe('process time zone', () => {
  const before = process.env.TZ;
  afterAll(() => { process.env.TZ = before; });

  it('is set to UTC by config/timezone, whatever the host had', () => {
    process.env.TZ = 'Asia/Kolkata';
    jest.isolateModules(() => { require('./timezone'); });
    expect(process.env.TZ).toBe('UTC');
  });
});
