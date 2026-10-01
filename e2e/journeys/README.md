# Recorded journeys (rehearsal R2)

Records every role's journey as captioned screenshots, on a phone and a laptop,
through the real website screens — for the owner to review wording and layout.

    scripts/record-journeys.sh /path/to/output

The script restarts the API with the fake providers, builds and starts the website
on :3000, then runs `record.spec.ts`. One OTC order and one Schedule H order go
from the buyer through the pharmacist, the packer and our rider back to the buyer;
the admin screens follow. Payments go through the fake Razorpay (Checkout is
stubbed in the browser) and the prescription upload through the in-memory object
store in `backend/test/fakes/s3.mjs`. Nothing real is called and nothing is kept:
the output folder gets `steps.json` (journey, role, device, title, caption) and
`shots/`. A step the screen could not do is done through the API and the step's
`note` says so.

Not a test suite: CI runs `tests/`, not this folder.
