# Recorded journeys (rehearsal R2)

Records every role's journey as captioned screenshots, on a phone and a laptop,
through the real website screens — for the owner to review wording and layout.

    scripts/record-journeys.sh /path/to/output

The script restarts the API with the fake providers, builds and starts the website
on :3000, then runs `record.spec.ts`. Payments go through the fake Razorpay
(Checkout is stubbed in the browser; refunds and webhooks are signed by the fake)
and uploads through the in-memory object store in `backend/test/fakes/`. Nothing
real is called and nothing is kept: the output folder gets `steps.json`
(journey, role, device, title, caption) and `shots/`. A step the screen could not
do is done through the API and the step's `note` says so.

`record.spec.ts` only sets the order of the story; each journey is in `flows/`:

| Journey | File | What it shows |
|---|---|---|
| Customer — everyday / prescription medicine | `customerOrder.ts` | OTC order on phone and laptop (waits for the pharmacist's check, then "Checked by pharmacist" on the order page — Sprint 35); Schedule H order with prescription upload; delivery code; delivered order |
| Pharmacist, Packer, Rider, Admin | `pharmacist.ts`, `packer.ts`, `rider.ts`, `admin.ts` | Rx check (which is also the order's pharmacist check) and the OTC order's pharmacist check and release (Sprint 35, C-08), packing and sealed dispatch, doorstep handover, admin screens |
| Doctor consultation | `doctorOnboarding.ts`, `doctor.ts` | Admin enables a doctor login, doctor submits the council registration, admin verifies it (C-22), doctor opens slots, pharmacist classifies a medicine (C-23); patient books and pays, doctor starts the consultation (join screens only — no Agora call), writes and issues the e-prescription, patient sees it, optionally sends it to Dawabag, any pharmacy checks the code (C-24) |
| Partner pharmacy | `partnerOnboarding.ts`, `partner.ts` | Admin approves the partner's licence and invoice series, links its login and commission; partner lists a catalogue product with stock; admin approves it live; a buyer's order goes to the partner, who seals, dispatches and delivers it; settlement for the partner (C-05, C-13, C-26, C-32) |
| Customer — forgot password | `forgotPassword.ts` | The DAWA BAG sign-in page; "Forgot password?" → code to the mobile (same answer for any mobile) → new password twice → signed in, other sessions ended (Sprint 35, C-41, C-44) |
| Returns and refunds | `returns.ts` | Buyer reports a damaged item on the delivered OTC order; pharmacist approves (credit note + refund); the refund waits at Razorpay and is settled by the signed webhook; packer records the pack destroyed; buyer sees the refund (C-37) |

Shared pieces are in `lib/`: `recorder.ts` (capture, manifest), `steps.ts`
(sessions, sign-in, `onScreenOr`), `people.ts` (packer, rider, doctor and
partner owner, the forgetful customer — mobiles 90000019xx), `fakes.ts`, `orders.ts`, `story.ts` (what
one journey hands the next), `time.ts`, `prescription.ts`. The test people,
products (`E2E-`) and partner pharmacy (`E2E …`) are removed by the usual
clean-up in `support/data.ts` at the start of the next run.

Not a test suite: CI runs `tests/`, not this folder.
