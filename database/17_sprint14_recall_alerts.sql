-- ─────────────────────────────────────────────────────────────────────────────
-- 17_sprint14_recall_alerts.sql — Sprint 14 (regulator recall / NSQ alerts, C-28)
-- Applied by the migration runner. Safe to re-run.
--
-- CDSCO's monthly not-of-standard-quality (NSQ) lists, FDA Maharashtra alerts and
-- manufacturer recalls arrive as lists of drug + batch. Each list is entered once;
-- every line is matched against the batches Dawabag and its partners hold or have
-- sold. The 4-hour clock (C-28) runs from when the alert was received. A matched
-- product is either recalled (batch_recalls) or cleared as a different product with
-- a note; a batch on an alert cannot be received or listed until that is done.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE SEQUENCE IF NOT EXISTS recall_alert_seq;

CREATE TABLE IF NOT EXISTS recall_alerts (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_no            VARCHAR(20) NOT NULL UNIQUE,                 -- RA-00001
  source              VARCHAR(20) NOT NULL
                        CHECK (source IN ('cdsco_nsq', 'fda_maharashtra', 'manufacturer', 'other')),
  reference           VARCHAR(200) NOT NULL,                       -- e.g. 'CDSCO NSQ alert August 2026'
  received_at         TIMESTAMPTZ NOT NULL,                        -- the 4-hour clock starts here
  due_at              TIMESTAMPTZ NOT NULL,
  entered_by          UUID NOT NULL REFERENCES users(id),
  entered_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  overdue_notified_at TIMESTAMPTZ,
  CHECK (due_at = received_at + INTERVAL '4 hours')
);
CREATE INDEX IF NOT EXISTS idx_recall_alerts_received ON recall_alerts(received_at DESC);

CREATE TABLE IF NOT EXISTS recall_alert_lines (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_id      UUID NOT NULL REFERENCES recall_alerts(id),
  line_no       INT NOT NULL,
  drug_name     VARCHAR(300) NOT NULL,
  batch_number  VARCHAR(100) NOT NULL,
  batch_key     VARCHAR(100) NOT NULL,             -- upper case, letters and digits only
  manufacturer  VARCHAR(300),
  reason        TEXT,
  UNIQUE (alert_id, line_no)
);
CREATE INDEX IF NOT EXISTS idx_recall_alert_lines_key ON recall_alert_lines(batch_key);

-- One row per product of ours whose batch matches a line: found at entry, or added
-- when an admin clears a product that was refused at receipt
CREATE TABLE IF NOT EXISTS recall_alert_matches (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  line_id        UUID NOT NULL REFERENCES recall_alert_lines(id),
  product_id     UUID NOT NULL REFERENCES products(id),
  batch_numbers  TEXT[] NOT NULL DEFAULT '{}',     -- our spellings of the batch number
  units_held     INT NOT NULL DEFAULT 0,           -- own + partner stock at entry
  units_sold     INT NOT NULL DEFAULT 0,           -- supplied on orders at entry
  decision       VARCHAR(10) NOT NULL DEFAULT 'pending' CHECK (decision IN ('pending', 'recalled', 'cleared')),
  recall_id      UUID REFERENCES batch_recalls(id),
  notes          TEXT,
  decided_by     UUID REFERENCES users(id),
  decided_at     TIMESTAMPTZ,
  UNIQUE (line_id, product_id),
  CHECK (decision = 'pending' OR (decided_by IS NOT NULL AND decided_at IS NOT NULL)),
  CHECK (decision <> 'cleared' OR length(trim(coalesce(notes, ''))) >= 5)
);

-- Alerts are a statutory trail (C-28, C-34): never edited or deleted; a decision is final
CREATE OR REPLACE FUNCTION recall_alert_final() RETURNS trigger AS $$
BEGIN
  -- data-fix sessions only (see 09_sprint6_beta_readiness.sql)
  IF current_setting('dawabag.maintenance', true) = 'on' THEN RETURN COALESCE(NEW, OLD); END IF;
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Recall alert records cannot be deleted'; END IF;
  IF TG_TABLE_NAME = 'recall_alert_matches' THEN
    IF OLD.decision <> 'pending' THEN RAISE EXCEPTION 'This recall decision is final'; END IF;
    IF NEW.line_id <> OLD.line_id OR NEW.product_id <> OLD.product_id THEN
      RAISE EXCEPTION 'A recall match cannot be moved';
    END IF;
    RETURN NEW;
  END IF;
  IF TG_TABLE_NAME = 'recall_alerts' THEN
    IF ROW(NEW.alert_no, NEW.source, NEW.reference, NEW.received_at, NEW.due_at, NEW.entered_by, NEW.entered_at)
       IS DISTINCT FROM ROW(OLD.alert_no, OLD.source, OLD.reference, OLD.received_at, OLD.due_at, OLD.entered_by, OLD.entered_at) THEN
      RAISE EXCEPTION 'Recall alerts cannot be changed';
    END IF;
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Recall alert lines cannot be changed';
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_recall_alerts_final ON recall_alerts;
CREATE TRIGGER trg_recall_alerts_final BEFORE UPDATE OR DELETE ON recall_alerts
  FOR EACH ROW EXECUTE FUNCTION recall_alert_final();
DROP TRIGGER IF EXISTS trg_recall_alert_lines_final ON recall_alert_lines;
CREATE TRIGGER trg_recall_alert_lines_final BEFORE UPDATE OR DELETE ON recall_alert_lines
  FOR EACH ROW EXECUTE FUNCTION recall_alert_final();
DROP TRIGGER IF EXISTS trg_recall_alert_matches_final ON recall_alert_matches;
CREATE TRIGGER trg_recall_alert_matches_final BEFORE UPDATE OR DELETE ON recall_alert_matches
  FOR EACH ROW EXECUTE FUNCTION recall_alert_final();
