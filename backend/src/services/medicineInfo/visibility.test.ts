// Sprint 33 guard: buyers see only APPROVED medicine information of a product on
// sale (C-19), substitutes and delivery dates follow the shop's listing rules
// (active, never Schedule X / NDPS — C-10). Checked on the code and migration,
// without a database; the smoke test (test/sprint33.smoke.mjs) checks it live.
import fs from 'fs';
import path from 'path';

const SRC = path.resolve(__dirname, '../..');
const read = (f: string) => fs.readFileSync(path.join(SRC, f), 'utf8');
const fn = (src: string, name: string) => src.slice(src.indexOf(`export async function ${name}`)).split(/\nexport /)[0];

describe('medicine information visibility (Sprint 33)', () => {
  const versions = read('services/medicineInfo/versions.service.ts');

  it('the public read takes only the approved version of an active, sellable product', () => {
    const pub = fn(versions, 'publicInfo');
    expect(pub).toMatch(/v\.status = 'approved'/);
    expect(pub).toMatch(/p\.is_active = TRUE/);
    expect(pub).toMatch(/NOT IN \('Schedule X', 'NDPS'\)/);
    expect(pub).not.toMatch(/pending_review|'draft'/);
  });

  it('the database allows one draft-or-pending and one live version, and a live version is always signed', () => {
    const sql = read('../../database/28_sprint33_medicine_info.sql');
    expect(sql).toMatch(/idx_product_info_one_open[\s\S]*WHERE status IN \('draft', 'pending_review'\)/);
    expect(sql).toMatch(/idx_product_info_one_live[\s\S]*WHERE status = 'approved'/);
    expect(sql).toMatch(/product_info_approved_signed CHECK[\s\S]*reviewer_reg_no IS NOT NULL/);
  });

  it('saving after submission sends the text back to draft, so nobody approves changed words', () => {
    expect(fn(versions, 'saveInfoDraft')).toMatch(/status = 'draft'[\s\S]*submitted_at = NULL/);
  });

  it('approval needs a registered pharmacist and a reason for flagged claims, and is audited', () => {
    const review = fn(versions, 'reviewInfo');
    expect(review).toMatch(/pharmacist_reg_no/);
    expect(review).toMatch(/flags\.length && notes\.length < 20/);
    expect(review).toMatch(/'product_info_approved' : 'product_info_rejected'/);
    expect(review).toMatch(/status = 'superseded'/);
    expect(read('routes/medicines.routes.ts')).toMatch(/info\/review', authenticate, authorize\('pharmacist_rx'\)/);
  });

  it('four eyes (Sprint 36): writers and submitters are recorded and cannot review; the database refuses it too', () => {
    expect(fn(versions, 'saveInfoDraft')).toMatch(/ADD_AUTHOR\('\$4::uuid'\)/);
    expect(fn(versions, 'saveInfoDraft')).toMatch(/author_ids\)\s*VALUES[\s\S]*ARRAY\[\$5::uuid\]/);
    expect(fn(versions, 'submitInfo')).toMatch(/ADD_AUTHOR\('\$2::uuid'\)/);
    const review = fn(versions, 'reviewInfo');
    expect(review).toMatch(/approve && \(open\.author_ids \?\? \[\]\)\.includes\(pharmacistId\)\) throw new AppError\(SELF_REVIEW_MESSAGE, 403\)/);
    // the check comes before anything is written
    expect(review.indexOf('SELF_REVIEW_MESSAGE')).toBeLessThan(review.indexOf("status = 'superseded'"));
    const sql = read('../../database/31_sprint36_merge_feed_keys_four_eyes.sql');
    expect(sql).toMatch(/product_info_four_eyes[\s\S]*NOT \(reviewed_by = ANY\(author_ids\)\)/);
    expect(fn(versions, 'publicInfo')).toMatch(/v\.status = 'approved'/);
  });

  it.each(['services/shopping/substitutes.service.ts', 'services/productPage/delivery.service.ts'])(
    '%s reads only sellable products', (file) => {
      const literals = read(file).match(/`[^`]*`/gs) ?? [];
      const unguarded = literals.filter((l) => /\bFROM\s+products\b/.test(l)).filter((l) => !/is_active|SELLABLE_SQL/.test(l));
      expect(unguarded).toEqual([]);
    });
});
