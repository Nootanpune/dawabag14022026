// R2 rehearsal: records every role's journey, step by step, on phone and laptop,
// against the running API and website with fake payment and storage providers.
// One test order of each kind goes the whole way: buyer → pharmacist → packer →
// rider → buyer; then a doctor consultation, a partner pharmacy's order and a
// return with its refund. Each journey lives in flows/. Run: see journeys/README.md.
import { test } from '@playwright/test';
import { writeManifest } from './lib/recorder';
import { startFakeProviders } from './lib/fakes';
import { setUpStaff } from './lib/people';
import { addPackPhotos } from './lib/photos';
import { newStory } from './lib/story';
import { customerChecked, customerDelivered, customerEveryday, customerOutForDelivery, customerPrescription } from './flows/customerOrder';
import { forgotPassword } from './flows/forgotPassword';
import { pharmacist } from './flows/pharmacist';
import { packer } from './flows/packer';
import { rider } from './flows/rider';
import { admin } from './flows/admin';
import { doctorOnboarding } from './flows/doctorOnboarding';
import { doctorConsultation } from './flows/doctor';
import { partnerOnboarding } from './flows/partnerOnboarding';
import { partnerOrder } from './flows/partner';
import { returnsAndRefunds } from './flows/returns';

test.setTimeout(20 * 60_000);

test('record every journey', async ({ browser }) => {
  await startFakeProviders();
  await setUpStaff();
  await addPackPhotos(browser, [
    { id: process.env.E2E_PRODUCT_ID!, name: 'Paracetamol', strength: '500 mg · 15 tablets', tint: '#2E7DBF' },
    { id: process.env.E2E_RX_PRODUCT_ID!, name: 'Amoxicillin', strength: '500 mg · 10 capsules', tint: '#C2410C' },
  ]);
  const story = newStory();
  try {
    await customerEveryday(browser, story);
    await customerPrescription(browser, story);
    await pharmacist(browser, story);
    await customerChecked(browser, story);
    await packer(browser, story);
    await customerOutForDelivery(browser, story);
    await rider(browser, story);
    await customerDelivered(browser, story);
    await admin(browser);
    await doctorOnboarding(browser);
    await doctorConsultation(browser);
    await partnerOnboarding(browser);
    await partnerOrder(browser, story);
    await returnsAndRefunds(browser, story);
    await forgotPassword(browser);
  } finally {
    writeManifest();   // whatever was recorded, even if a journey stopped part-way
  }
});
