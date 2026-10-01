// Security incident register (Rulebook C-43). CERT-In must be told within 6 hours
// of detection; a personal-data breach also goes to the Data Protection Board and
// the affected users. Deadlines and overdue flags are computed by the server.
import api from '../api';

export const INCIDENT_CATEGORIES = [
  { value: 'data_breach', label: 'Data breach' },
  { value: 'unauthorised_access', label: 'Unauthorised access' },
  { value: 'malware', label: 'Malware / ransomware' },
  { value: 'phishing', label: 'Phishing' },
  { value: 'service_outage', label: 'Service outage' },
  { value: 'payment_fraud', label: 'Payment fraud' },
  { value: 'lost_device', label: 'Lost / stolen device' },
  { value: 'other', label: 'Other' },
] as const;
export const INCIDENT_SEVERITIES = ['low', 'medium', 'high', 'critical'] as const;
export const INCIDENT_STATUSES = ['open', 'contained', 'closed'] as const;

export type IncidentCategory = (typeof INCIDENT_CATEGORIES)[number]['value'];
export type IncidentSeverity = (typeof INCIDENT_SEVERITIES)[number];
export type IncidentStatus = (typeof INCIDENT_STATUSES)[number];

export interface Incident {
  id: string;
  incident_no: string;
  title: string;
  category: IncidentCategory;
  severity: IncidentSeverity;
  description: string;
  personal_data_affected: boolean;
  detected_at: string;
  status: IncidentStatus;
  cert_in_due_at: string;
  cert_in_overdue: boolean;
  cert_in_late: boolean;
  cert_in_reported_at: string | null;
  cert_in_reference: string | null;
  dpb_notified_at: string | null;
  users_notified_at: string | null;
  actions_taken: string | null;
  reported_by_name: string | null;
}

export interface NewIncident {
  title: string;
  category: IncidentCategory;
  severity: IncidentSeverity;
  description: string;
  personal_data_affected: boolean;
  /** ISO 8601 with offset */
  detected_at: string;
}

export interface IncidentUpdate {
  status?: IncidentStatus;
  cert_in_reported_at?: string;
  cert_in_reference?: string;
  dpb_notified_at?: string;
  users_notified_at?: string;
  actions_taken?: string;
}

export const incidentKeys = {
  all: ['incidents'] as const,
  list: (status: string) => ['incidents', 'list', status] as const,
  one: (id: string) => ['incidents', 'one', id] as const,
};

export function categoryLabel(c: string): string {
  return INCIDENT_CATEGORIES.find((x) => x.value === c)?.label ?? c;
}

export async function fetchIncidents(status?: IncidentStatus): Promise<Incident[]> {
  const { data } = await api.get('/compliance/incidents', { params: status ? { status } : undefined });
  return data.data?.incidents ?? [];
}

export async function fetchIncident(id: string): Promise<Incident> {
  const { data } = await api.get(`/compliance/incidents/${id}`);
  return data.data;
}

export async function createIncident(body: NewIncident): Promise<{ id: string; incident_no: string; cert_in_due_at: string }> {
  const { data } = await api.post('/compliance/incidents', body);
  return data.data;
}

export async function updateIncident(id: string, body: IncidentUpdate) {
  const { data } = await api.patch(`/compliance/incidents/${id}`, body);
  return data.data as { id: string; status: IncidentStatus };
}

/** <input type="datetime-local"> value → ISO string (UTC, accepted as an offset time). */
export function localInputToIso(v: string): string | undefined {
  if (!v) return undefined;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

/** Now as a datetime-local value, for defaults and max= limits. */
export function nowLocalInput(): string {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

/** "2h 14m" style countdown; negative ms render as overdue time. */
export function formatDuration(ms: number): string {
  const mins = Math.floor(Math.abs(ms) / 60000);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h >= 48 ? `${Math.floor(h / 24)}d ${h % 24}h` : `${h}h ${String(m).padStart(2, '0')}m`;
}
