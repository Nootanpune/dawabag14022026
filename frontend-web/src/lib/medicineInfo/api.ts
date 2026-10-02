// Medicine information API (Sprint 33). Server is the only store: drafts are saved
// there; nothing is kept in the browser.
import api from '../api';
import type { InfoContent, InfoEditorData, InfoQueueItem, PublicInfo } from './types';

export const medicineInfoKeys = {
  public: (id: string) => ['medicine-info', id] as const,
  editor: (id: string) => ['medicine-info', id, 'editor'] as const,
  queue: ['medicine-info', 'review-queue'] as const,
};

export async function fetchMedicineInfo(productId: string): Promise<PublicInfo> {
  const { data } = await api.get(`/medicines/${productId}/info`);
  return data.data;
}

export async function fetchInfoEditor(productId: string): Promise<InfoEditorData> {
  const { data } = await api.get(`/medicines/${productId}/info/editor`);
  return data.data;
}

export async function saveInfoDraft(productId: string, content: InfoContent): Promise<{ version: number; status: string; problems: string[]; flags: unknown[] }> {
  const { data } = await api.put(`/medicines/${productId}/info/draft`, { content });
  return data.data;
}

export async function submitInfo(productId: string) {
  const { data } = await api.post(`/medicines/${productId}/info/submit`);
  return data.data;
}

export async function reviewInfo(productId: string, approve: boolean, notes: string) {
  const { data } = await api.post(`/medicines/${productId}/info/review`, { approve, notes });
  return data.data;
}

export async function fetchInfoQueue(): Promise<InfoQueueItem[]> {
  const { data } = await api.get('/medicines/info-review/queue');
  return data.data?.versions ?? [];
}
