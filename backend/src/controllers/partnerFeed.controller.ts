// src/controllers/partnerFeed.controller.ts — Sprint 36: the partner's billing
// software pushes its stock file with an API key. Exactly the manual upload's
// pipeline (createImport: read in memory, columns from the partner's saved choice
// or the software's preset, lines matched and checked) — the file is never written
// to disk (standing rule). The result is a DRAFT import: the partner reviews and
// applies it in the portal, where a person makes the declarations (cold chain,
// Schedule H1, catalogue price) — see docs/partner-stock-api.md.
import { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/AppError';
import { createImport, DRAFT_VALID_HOURS, readImportFile } from '../services/partnerStockImport/import.service';
import { missingRequired } from '../services/partnerStockImport/fields';
import { parseSnapshot, snapshotToImport } from '../services/partnerLiveFeed/snapshot';
import { receiveSnapshot } from '../services/partnerLiveFeed/liveApply.service';
import { loadFeed } from '../services/partnerLiveFeed/settings.service';
import { z } from 'zod';
import { recordKeyUse } from '../services/partnerApiKeys/keys.service';
import { maskedKey } from '../services/partnerApiKeys/keys';
import { clientIp } from '../middleware/partnerApiKey.middleware';

// GET /partner-feed/:partnerId/whoami — lets the software's installer test its key
export async function getFeedWhoami(req: Request, res: Response, next: NextFunction) {
  try {
    const k = req.partnerKey!;
    await recordKeyUse(k, clientIp(req), { action: 'whoami' });
    // Sprint 37: the connector learns its mode and where to resume its sequence numbers
    const f = await loadFeed(k.partnerId);
    res.json({ success: true, data: { partner_id: k.partnerId, partner_name: k.partnerName, key: maskedKey(k.prefix), scope: k.scope,
      stock_feed: { mode: f.mode, last_sequence: f.last_sequence === null ? null : Number(f.last_sequence), last_taken_at: f.last_taken_at,
        stale_after_minutes: f.stale_after_minutes } } });
  } catch (e) { next(e); }
}

// POST /partner-feed/:partnerId/stock-files (multipart "file")
export async function postFeedStockFile(req: Request, res: Response, next: NextFunction) {
  try {
    const k = req.partnerKey!;
    if (!req.file?.buffer) throw new AppError('Attach the stock file as the multipart field "file"', 422);
    const made = await createImport(k.partnerId, { userId: null, apiKey: { id: k.keyId, prefix: k.prefix } },
      { buffer: req.file.buffer, originalname: req.file.originalname, size: req.file.size });
    await recordKeyUse(k, clientIp(req), { action: 'stock_file_uploaded', import_id: made.id });
    res.status(201).json({ success: true, data: {
      import_id: made.id,
      status: 'draft',
      summary: made.summary,
      next_step: `Waiting in the Dawabag partner portal (Stock import) for the partner to review and apply within ${DRAFT_VALID_HOURS} hours`,
    } });
  } catch (e) { next(e); }
}

// Sprint 37 — POST /partner-feed/:partnerId/stock-snapshot: a FULL stock snapshot from the
// partner's connector, for a partner in live mode (docs/partner-stock-api.md §6):
//   • the stock FILE (primary: MediVision's scheduled Excel / CSV export, multipart "file"),
//     ordered by the time the export was made — "X-Snapshot-Taken-At" header or "taken_at"
//     field, else the upload time — and made idempotent by the file's SHA-256;
//   • or JSON with an explicit sequence.
// Quantities of linked, listed products apply at once; the rest waits for a person.
const isoTime = z.string().datetime({ offset: true });
const seqNum = z.coerce.number().int().min(1).max(Number.MAX_SAFE_INTEGER);

/** A live stock file → snapshot input. Pure apart from reading the file and the partner's saved columns. */
async function liveFileInput(req: Request, partnerId: string) {
  const header = (h: string) => { const v = req.headers[h]; return Array.isArray(v) ? v[0] : v; };
  const rawTime = (req.body?.taken_at as string | undefined) ?? header('x-snapshot-taken-at');
  const rawSeq = (req.body?.sequence as string | undefined) ?? header('x-snapshot-sequence');
  let takenAt = new Date();                          // no time sent: the upload time
  if (rawTime !== undefined) {
    const t = isoTime.safeParse(String(rawTime).trim());
    if (!t.success) throw new AppError('taken_at / X-Snapshot-Taken-At must be a date and time with offset, e.g. 2026-10-03T15:30:00+05:30', 422);
    takenAt = new Date(t.data);
  }
  let sequence: number;
  if (rawSeq !== undefined && String(rawSeq).trim() !== '') {
    const n = seqNum.safeParse(rawSeq);
    if (!n.success) throw new AppError('sequence / X-Snapshot-Sequence must be a whole number of 1 or more', 422);
    sequence = n.data;
  } else {
    // No sequence: the export time orders the files (milliseconds since 1970). The same
    // file sent again with the same time is a replay; with a later time, "unchanged".
    sequence = takenAt.getTime();
  }
  const prep = await readImportFile(partnerId, { buffer: req.file!.buffer, originalname: req.file!.originalname, size: req.file!.size });
  // A live file must use known columns: the partner's confirmed choice or the software's preset
  if (prep.mappingSource === 'suggested' || missingRequired(prep.mapping).length) {
    throw new AppError('The columns of this file are not known yet: upload it once in the partner portal and confirm the columns, or send JSON', 422);
  }
  return { prep, sequence, takenAt };
}

async function answerSnapshot(req: Request, res: Response, input: Parameters<typeof receiveSnapshot>[1]) {
  const k = req.partnerKey!;
  const result = await receiveSnapshot(k, input);
  await recordKeyUse(k, clientIp(req), { action: `stock_snapshot_${result.status}`, import_id: result.import_id ?? undefined });
  res.json({ success: true, data: result });
}

export async function postFeedSnapshot(req: Request, res: Response, next: NextFunction) {
  try {
    const k = req.partnerKey!;
    if (req.file?.buffer) return await answerSnapshot(req, res, await liveFileInput(req, k.partnerId));
    if (req.is('multipart/form-data')) throw new AppError('Attach the stock file as the multipart field "file", or send the snapshot as JSON', 422);
    const snap = parseSnapshot(req.body);
    await answerSnapshot(req, res, { prep: snapshotToImport(snap, Buffer.byteLength(JSON.stringify(req.body))), sequence: snap.sequence,
      takenAt: new Date(snap.taken_at) });
  } catch (e) { next(e); }
}

/** For a partner in live mode, /stock-files is the same live snapshot (so a Sprint 36 uploader keeps working). */
export async function liveFileIfLive(req: Request, res: Response, next: NextFunction) {
  try {
    const k = req.partnerKey!;
    if ((await loadFeed(k.partnerId)).mode !== 'live') return next();
    if (!req.file?.buffer) throw new AppError('Attach the stock file as the multipart field "file"', 422);
    await answerSnapshot(req, res, await liveFileInput(req, k.partnerId));
  } catch (e) { next(e); }
}
