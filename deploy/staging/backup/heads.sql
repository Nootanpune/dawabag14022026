-- Chain heads recorded with each backup (Sprint 41; C-09, C-46; RUNBOOK §6 "Restore drill").
-- Read just BEFORE pg_dump starts, so every head named here is inside the dump: after a
-- restore each one must still be there with the same hash (restore.sh checks it).
--   audit     the audit-log chain: last chain_seq and its row_hash (now)
--   h1        each Schedule H1 register (one per seller licence): last entry_no and row_hash (now)
--   recorded  the last head the nightly chain_verify job recorded per chain (and whether it was ok)
--   chain_start  the integrity.chain_start setting, if any (a restarted chain)
SELECT json_build_object(
  'taken_at', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
  'database', current_database(),
  'last_migration', (SELECT max(file) FROM schema_migrations),
  'audit', (SELECT json_build_object('last_no', chain_seq, 'head_hash', row_hash)
              FROM audit_logs WHERE chain_seq IS NOT NULL ORDER BY chain_seq DESC LIMIT 1),
  'h1', COALESCE((SELECT json_object_agg(register_key, json_build_object('last_no', entry_no, 'head_hash', row_hash))
              FROM (SELECT DISTINCT ON (register_key) register_key, entry_no, row_hash FROM h1_register
                    WHERE NOT chain_legacy AND entry_no IS NOT NULL AND register_key IS NOT NULL
                    ORDER BY register_key, entry_no DESC) h), '{}'::json),
  'recorded', COALESCE((SELECT json_object_agg(chain, json_build_object('last_no', last_no, 'head_hash', head_hash, 'ok', ok,
                'recorded_at', to_char(recorded_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')))
              FROM (SELECT DISTINCT ON (chain) chain, last_no, head_hash, ok, recorded_at FROM chain_heads
                    ORDER BY chain, recorded_at DESC) c), '{}'::json),
  'chain_start', (SELECT value FROM app_settings WHERE key = 'integrity.chain_start')
)::text;
