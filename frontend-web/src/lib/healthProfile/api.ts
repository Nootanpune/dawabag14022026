// Health profile (Sprint 33): kept on the server only with the buyer's explicit
// consent (C-41); deletable at any time (C-43, C-44). Our pharmacists see it on
// the order they check (C-08).
import api from '../api';

export interface FamilyMember {
  id: string;
  full_name: string;
  relationship: string | null;
  age: number | null;
  allergies: string[];
  conditions: string[];
}

export interface HealthProfile {
  consent: { given: boolean; recorded_at: string | null; version: string; purpose: string };
  allergies: string[];
  conditions: string[];
  current_medicines: string[];
  updated_at: string | null;
  family_members: FamilyMember[];
}

export interface MemberInput {
  full_name: string;
  relationship: string;
  age_years: number | null;
  allergies: string[];
  conditions: string[];
}

export interface OrderHealthNote {
  order_id: string;
  shared: boolean;
  for?: 'buyer' | 'family_member';
  full_name?: string;
  relationship?: string | null;
  age?: number | null;
  allergies?: string[];
  conditions?: string[];
  current_medicines?: string[];
}

export const healthKeys = {
  mine: ['health-profile'] as const,
  order: (orderId: string) => ['health-profile', 'order', orderId] as const,
};

export async function fetchHealthProfile(): Promise<HealthProfile> {
  const { data } = await api.get('/health-profile');
  return data.data;
}

export async function saveHealthProfile(body: { consent?: boolean; allergies: string[]; conditions: string[]; current_medicines: string[] }): Promise<HealthProfile> {
  const { data } = await api.put('/health-profile', body);
  return data.data;
}

export async function deleteHealthProfile(): Promise<HealthProfile> {
  const { data } = await api.delete('/health-profile');
  return data.data;
}

export async function addFamilyMember(body: MemberInput & { consent?: boolean }): Promise<HealthProfile> {
  const { data } = await api.post('/health-profile/members', body);
  return data.data;
}

export async function updateFamilyMember(id: string, body: MemberInput): Promise<HealthProfile> {
  const { data } = await api.put(`/health-profile/members/${id}`, body);
  return data.data;
}

export async function removeFamilyMember(id: string): Promise<HealthProfile> {
  const { data } = await api.delete(`/health-profile/members/${id}`);
  return data.data;
}

/** Pharmacists only: the health details for the person an order is for (each look is audited, C-46). */
export async function fetchOrderHealthNote(orderId: string): Promise<OrderHealthNote> {
  const { data } = await api.get(`/health-profile/orders/${orderId}`);
  return data.data;
}

/** "Penicillin, Sulpha drugs" ⇄ list (one per line or comma-separated) */
export const splitList = (text: string) => text.split(/[\n,]/).map((s) => s.trim()).filter(Boolean);
export const joinList = (xs: string[]) => xs.join('\n');
