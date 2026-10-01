'use client';
import { useCallback, useState } from 'react';
import { getApiErrorMessage } from '@/lib/apiErrors';
import { uploadPhotoBatch, type BulkPhotoResult } from '@/lib/admin/bulkPhotos/api';
import { sendable, toBatches, type PlannedPhoto } from '@/lib/admin/bulkPhotos/plan';

export interface BulkUploadState {
  running: boolean;
  sent: number;
  total: number;
  batch: number;
  batches: number;
  /** one result per planned file, in plan order; null until the run finishes */
  results: BulkPhotoResult[] | null;
  /** a whole batch was refused (e.g. 503 no photo store); later batches are not sent */
  error: string;
}

const IDLE: BulkUploadState = { running: false, sent: 0, total: 0, batch: 0, batches: 0, results: null, error: '' };

/** Sends the plan in batches of ≤ 50 files, one batch at a time, and collects per-file results. */
export function useBulkPhotoUpload() {
  const [state, setState] = useState<BulkUploadState>(IDLE);

  const start = useCallback(async (plan: PlannedPhoto[]) => {
    const batches = toBatches(sendable(plan));
    const total = batches.reduce((n, b) => n + b.length, 0);
    const byId = new Map<string, BulkPhotoResult>();
    let error = '';
    setState({ ...IDLE, running: true, total, batches: batches.length, batch: batches.length ? 1 : 0 });
    let sent = 0;
    for (const [i, batch] of batches.entries()) {
      setState((s) => ({ ...s, batch: i + 1 }));
      try {
        const res = await uploadPhotoBatch(batch.map((p) => p.file));
        // The API answers one result per file, in the order sent
        batch.forEach((p, j) => res.results[j] && byId.set(p.id, res.results[j]));
      } catch (err) {
        error = getApiErrorMessage(err, 'The upload failed');
        break;
      }
      sent += batch.length;
      setState((s) => ({ ...s, sent }));
    }
    const results = plan.map((p): BulkPhotoResult => {
      if (p.problem) return { file: p.name, sku: p.sku, status: p.problemStatus ?? 'failed', message: `${p.problem} (not sent)` };
      return byId.get(p.id) ?? { file: p.name, sku: p.sku, status: 'failed', message: error ? `Not saved: ${error}` : 'No answer for this file' };
    });
    setState((s) => ({ ...s, running: false, sent, results, error }));
  }, []);

  const reset = useCallback(() => setState(IDLE), []);
  return { state, start, reset };
}
