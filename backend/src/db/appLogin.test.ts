// Sprint 41: the API's own restricted database login (RUNBOOK §6) — name and password rules,
// the SCRAM verifier sent instead of the password, and what ensureAppLogin asks of PostgreSQL.
import crypto from 'crypto';
import { ensureAppLogin, loginNameProblem, loginPasswordProblem, scramVerifier } from './appLogin';

describe('API login rules', () => {
  it('refuses reserved or owner names', () => {
    expect(loginNameProblem('dawabag_api')).toBeNull();
    expect(loginNameProblem('dawabag_maintenance')).toMatch(/cannot be/);
    expect(loginNameProblem('dawabag_app')).toMatch(/cannot be/);
    expect(loginNameProblem('pg_monitor')).toMatch(/cannot be/);
    expect(loginNameProblem('dawabag_user', 'dawabag_user')).toMatch(/differ from the database owner/);
    expect(loginNameProblem('Api; DROP')).toMatch(/lower-case/);
  });
  it('wants a long printable password that is not the example', () => {
    expect(loginPasswordProblem(undefined)).toMatch(/not set/);
    expect(loginPasswordProblem('short')).toMatch(/16/);
    expect(loginPasswordProblem('has a space in it 123')).toMatch(/printable/);
    expect(loginPasswordProblem('change-me-another-long-random')).toMatch(/example/);
    expect(loginPasswordProblem('276a1cea0b62268adc196dfe4e2460bd1f18ee47a93e9222')).toBeNull();
  });
});

describe('SCRAM-SHA-256 verifier', () => {
  it('has PostgreSQL\'s stored form and matches RFC 5802 for a given salt', () => {
    const salt = Buffer.from('W22ZaJ0SNY7soEsUEjb6gQ==', 'base64');
    const v = scramVerifier('pencil', salt, 4096);
    const m = v.match(/^SCRAM-SHA-256\$4096:([^$]+)\$([^:]+):(.+)$/);
    expect(m).not.toBeNull();
    expect(m![1]).toBe('W22ZaJ0SNY7soEsUEjb6gQ==');
    const salted = crypto.pbkdf2Sync('pencil', salt, 4096, 32, 'sha256');
    const clientKey = crypto.createHmac('sha256', salted).update('Client Key').digest();
    expect(m![2]).toBe(crypto.createHash('sha256').update(clientKey).digest('base64'));
    expect(m![3]).toBe(crypto.createHmac('sha256', salted).update('Server Key').digest('base64'));
    expect(scramVerifier('pencil')).not.toBe(scramVerifier('pencil'));   // a fresh salt each time
  });
});

describe('ensureAppLogin', () => {
  it('creates the login with fixed attributes, one membership, never the plain password', async () => {
    const sent: string[] = [];
    const c = {
      query: jest.fn(async (sql: string) => {
        sent.push(sql);
        if (/current_user AS u/.test(sql)) return { rows: [{ u: 'dawabag_user' }] };
        if (/current_database/.test(sql)) return { rows: [{ d: 'dawabag' }] };
        if (/FROM pg_roles WHERE rolname = \$1/.test(sql) && /SELECT 1/.test(sql)) return { rows: [{}] };
        if (/SELECT rolsuper FROM pg_roles/.test(sql)) return { rows: [] };
        if (/pg_auth_members/.test(sql)) return { rows: [{ rolname: 'dawabag_maintenance' }] };
        if (/FROM pg_proc/.test(sql)) return { rows: [{}] };
        if (/count\(\*\)::int AS n FROM pg_class/.test(sql)) return { rows: [{ n: 0 }] };
        return { rows: [] };
      }),
    };
    const r = await ensureAppLogin(c, 'dawabag_api', 'a-long-random-password-0123');
    expect(r).toEqual({ login: 'dawabag_api', created: true, revoked: ['dawabag_maintenance'] });
    const create = sent.find((s) => s.startsWith('CREATE ROLE "dawabag_api"'))!;
    expect(create).toMatch(/LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS INHERIT/);
    expect(create).toMatch(/PASSWORD 'SCRAM-SHA-256\$4096:/);
    expect(sent.join('\n')).not.toContain('a-long-random-password-0123');
    expect(sent).toContain('REVOKE "dawabag_maintenance" FROM "dawabag_api"');
    expect(sent).toContain('GRANT "dawabag_app" TO "dawabag_api"');
    expect(sent.some((s) => /ALTER FUNCTION dawabag_purge_prescriptions\(integer\) OWNER TO dawabag_maintenance/.test(s))).toBe(true);
  });
});
