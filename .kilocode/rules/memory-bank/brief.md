# Project Brief: Dawabag Online Pharmacy

Dawabag is an online pharmacy based in Nashik, Maharashtra, selling to four buyer
types: B2C patients, B2B retailers (incl. hospital pharmacies), B2B wholesalers,
and NMC-registered doctors, plus a marketplace of licensed partner pharmacies.

Source documents (in `docs/`): URS v3.1 FINAL, Customer Segmentation v2.2,
Beta Deployment Guide, Project Resume Guide v2 (sprint plan). Owner decisions
that override the URS are in `docs/DECISIONS.md`.

Hard constraints:
- Indian drug law (Drugs and Cosmetics Act/Rules, Pharmacy Act, NDPS), GST,
  consumer e-commerce rules and the DPDP Act. The Dawabag Regulatory Compliance
  Rulebook (rules C-01..C-46) must be followed; cite rule numbers in code comments.
- Data stays in India (AWS ap-south-1).
