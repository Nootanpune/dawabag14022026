// Shapes of the launch-readiness page (Sprint 49). Facts are counts, flags and dates read
// from the database and the server's environment — the PRESENCE of a secret only, never
// its value (C-41, C-44). The pure rules in computed.ts turn facts into item statuses.

export const READINESS_STATUSES = ['done', 'in_progress', 'not_started', 'not_applicable'] as const;
export type ReadinessStatus = (typeof READINESS_STATUSES)[number];

export const SECTIONS: Record<number, string> = {
  1: 'Legal and licences',
  2: 'Payments',
  3: 'SMS and WhatsApp',
  4: 'Server and secrets',
  5: 'Data and catalogue',
  6: 'Staff set-up',
  7: 'Policies',
  8: 'Testing',
};

export interface ReadinessLink { href: string; label: string }

export interface ReadinessItem {
  key: string;
  ref: string;               // the row number in docs/LAUNCH_CHECKLIST.md
  section: number;
  kind: 'computed' | 'manual';
  title: string;
  who: string;
  status: ReadinessStatus;
  status_label: string;
  evidence: string[];
  link: ReadinessLink | null;
  note?: string | null;
  updated_at?: string | null;
  updated_by_name?: string | null;
}

export interface PolicyFact { key: string; published: boolean; lawyer_reviewed: boolean }

export interface ReadinessFacts {
  now: string;                                   // ISO time the facts were read
  app_env: string;                               // APP_ENV, or 'development' when unset
  secrets: {
    razorpay_key_id: boolean; razorpay_key_secret: boolean; razorpay_webhook_secret: boolean;
    razorpay_mode: 'live' | 'test' | 'unknown' | null;   // from the key id's prefix only
    msg91_auth_key: boolean;
    health_enc_key: boolean; totp_enc_key: boolean;
    shiprocket: boolean; fcm: boolean; agora: boolean;
    provider_overrides: string[];                // *_BASE_URL names pointing at a stand-in (names only)
  };
  public_web_url: string | null;                 // a public address, not a secret
  sms: { otp_template: boolean; mapped: string[]; required: string[] };
  webhooks: { last_received_at: string | null; last_30_days: number };
  two_factor: { policy: 'optional' | 'required'; logins: number; enrolled: number };
  pharmacists: { dawabag: number; dawabag_recorded: number; dawabag_verified: number; partner: number; partner_verified: number };
  cold_chain_couriers: number;
  policies: PolicyFact[];
  practitioners: { total: number; verified: number; pending: number; lapsed: number; refused: number };
  products: {
    live: number; live_copy_pending: number;
    drafts_open: number; drafts_with_suggestions: number;
    live_with_info: number; live_without_info: number; imported_info_open: number;
    buyer_restricted: number;
    online_restricted_live: number; online_restricted_all: number; online_permitted_live: number;
    schedule_c_c1: number;
  };
  emergency_stop: { paused: boolean; since: string | null; reference: string | null };
  backup: { last_ok_at: string | null; last_failed_at: string | null };
  chain: { last_checked_at: string | null; chains: number; broken: number; last_job_status: string | null };
  db_login: { user: string | null; restricted: boolean | null };
  demo: { logins: number; products: number };
  stock_feeds: { live_partners: number; newest_snapshot_at: string | null };
  riders: number;
}
