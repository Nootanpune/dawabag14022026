// Schedule H1 registers per seller licence and the hash-chain checks (Sprint 38; C-09, C-46).
// The server builds every report and recomputes every hash; nothing is kept in the browser.
import api from '../api';
import { downloadFromApi } from '../download';
import type { H1Entry } from '../fulfilment/types';

export interface ChainBreak { no: number | null; id: string | null; problem: string }
export interface ChainReport {
  ok: boolean;
  checked: number;
  last_no: number | null;
  head_hash: string | null;
  first_break: ChainBreak | null;
  legacy_rows: number;
  complete: boolean;
  next_from: number | null;
}
export interface H1RegisterReport extends ChainReport { register_key: string }
export interface H1RegisterSummary {
  register_key: string;
  seller_type: 'dawabag' | 'partner';
  partner_name: string | null;
  seller_licence_no: string | null;
  entries: number;
  last_entry_no: number | null;
}
export interface H1Incomplete {
  prescription_id: string;
  order_id: string;
  order_number: string;
  patient_name: string | null;
  prescriber_name: string | null;
  prescriber_reg_no: string | null;
  prescriber_address: string | null;
  products: string;
  sellers: string;
}

export const registerKeys = {
  verify: ['registers', 'verify'] as const,
  audit: ['registers', 'audit'] as const,
  partner: (from: string, to: string) => ['registers', 'partner', from, to] as const,
  partnerVerify: ['registers', 'partner-verify'] as const,
  incomplete: ['registers', 'h1-incomplete'] as const,
};

// ── Staff / admin ────────────────────────────────────────────────────────────
export async function verifyH1Registers(): Promise<{ ok: boolean; registers: H1RegisterReport[] }> {
  const { data } = await api.get('/fulfilment/h1-register/verify');
  return data.data;
}
export async function verifyAuditChain(): Promise<ChainReport> {
  const { data } = await api.get('/admin/audit-chain/verify');
  return data.data;
}
export async function fetchH1Incomplete(): Promise<H1Incomplete[]> {
  const { data } = await api.get('/fulfilment/prescriptions/h1-incomplete');
  return data.data?.prescriptions ?? [];
}
export async function completePrescriber(prescriptionId: string, body: { prescriber_address?: string; prescriber_reg_no?: string }) {
  const { data } = await api.post(`/fulfilment/prescriptions/${prescriptionId}/prescriber-details`, body);
  return data.data;
}

// ── Partner portal: its own register only ────────────────────────────────────
export async function fetchPartnerH1(from: string, to: string): Promise<{ entries: H1Entry[]; registers: H1RegisterSummary[] }> {
  const { data } = await api.get('/partner/h1-register', { params: { from, to } });
  return { entries: data.data?.entries ?? [], registers: data.data?.registers ?? [] };
}
export function downloadPartnerH1Csv(from: string, to: string) {
  return downloadFromApi('/partner/h1-register', `h1-register-${from}-to-${to}.csv`, { from, to, format: 'csv' });
}
export async function verifyPartnerH1(): Promise<{ ok: boolean; registers: H1RegisterReport[] }> {
  const { data } = await api.get('/partner/h1-register/verify');
  return data.data;
}

// ── Sprint 40: recorded chain heads and the nightly check ────────────────────
export interface ChainHead {
  chain: string;
  last_no: number | null;
  head_hash: string | null;
  checked: number;
  ok: boolean;
  problem: string | null;
  source: 'job' | 'manual';
  recorded_at: string;
}
export interface ChainHeads {
  heads: ChainHead[];
  last_job_run: { status: string; started_at: string; finished_at: string | null; error: string | null } | null;
  chain_start: Record<string, number>;
}
export const chainHeadKeys = { heads: ['registers', 'chain-heads'] as const };

export async function fetchChainHeads(): Promise<ChainHeads> {
  const { data } = await api.get('/admin/chain-heads');
  return data.data;
}
export async function runChainCheck(): Promise<{ ok: boolean; chains: number; broken: number }> {
  const { data } = await api.post('/admin/chain-heads/verify');
  return data.data;
}
