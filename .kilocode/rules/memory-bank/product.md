# Product Context

| Buyer type (`customer_type`) | Pricing column | KYC | Payment terms |
| --- | --- | --- | --- |
| `customer` (B2C) | `offer_price_paise` | none — active after OTP | prepaid |
| `b2b_retailer` (DL 20/21, GST optional) | `ptr_price_paise` | admin review | prepaid → CAD → net 7/15/30 |
| `b2b_wholesaler` (DL 20B/21B + GST) | `pts_price_paise` | admin review | prepaid → CAD → net 30/45/60 |
| `doc_hospital` (NMC doctor, no GST) | `institutional_price_paise` | admin review | prepaid → net 7/15 |

Trade pricing, credit terms and the Schedule H/H1 prescription exemption apply
only when `kyc_status = 'approved'`; until then the account is treated as B2C
and cannot order. Schedule X and NDPS are never sold online.

Registration is 4 steps: type → details (+ privacy consent, 18+, optional
marketing) → documents (trade types) → OTP, then document upload.
