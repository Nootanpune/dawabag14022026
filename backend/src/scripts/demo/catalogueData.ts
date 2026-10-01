// src/scripts/demo/catalogueData.ts — the trial server's demo catalogue: common
// medicines by GENERIC name and strength only (no brand names or trademarks), with
// realistic Indian MRPs, drug schedules, HSN codes and pack sizes. Prices, GST rates
// and schedules are demonstration values — confirm real ones with the pharmacist and
// the CA before any real catalogue (medicine GST changed in Sept 2025). No Schedule X
// or NDPS item (C-08, C-23). Every product names "Demo Pharma Pvt Ltd" (C-17).

export type Schedule = 'OTC' | 'Schedule H' | 'Schedule H1';

export interface DemoMedicine {
  code: string;              // SKU is DEMO-<code>
  name: string;              // generic name + strength + dosage form
  generic: string;
  composition: string;
  category: DemoCategory;
  schedule: Schedule;
  mrp: number;               // rupees
  offer: number;             // rupees, ≤ MRP
  gst: 5 | 12;
  hsn: string;
  net: string;               // net quantity (Legal Metrology)
  form: 'tablet' | 'capsule' | 'liquid' | 'tube' | 'sachet' | 'pack' | 'device';
  /** Telemedicine list (TPG 2020, C-23): A first consult, B follow-up only; null = left to the pharmacist */
  tele?: 'O' | 'A' | 'B' | null;
  /** Stocked only by the demo partner pharmacy, not by Dawabag (shows partner stock, C-05) */
  partnerOnly?: boolean;
  /** Also listed by the demo partner pharmacy */
  partner?: boolean;
  description: string;
}

export const DEMO_CATEGORIES = ['Fever & pain', 'Allergy', 'Digestion', 'Diabetes', 'Heart & BP', 'Antibiotics', 'Vitamins', 'First aid'] as const;
export type DemoCategory = typeof DEMO_CATEGORIES[number];

export const DEMO_SKU_PREFIX = 'DEMO-';
export const DEMO_MANUFACTURER = 'Demo Pharma Pvt Ltd';
export const DEMO_MANUFACTURER_ADDRESS = 'DEMO address, not a real manufacturer: Plot 0, MIDC Satpur, Nashik 422007, Maharashtra';

const STORE = 'Store below 30°C in a dry place, protected from light. Keep out of reach of children.';
export const storageFor = (m: DemoMedicine) =>
  m.form === 'device' ? 'Store in a clean, dry place.' : m.form === 'liquid' ? `${STORE} Shake well before use.` : STORE;

// Factual, neutral copy: what it is and how to use it safely. No cure or
// guarantee claims (Drugs and Magic Remedies Act; C-19 copy review).
const rx = 'Take only as prescribed by a registered medical practitioner.';
const otc = 'Read the label before use. Consult a doctor if symptoms persist.';

export const DEMO_MEDICINES: DemoMedicine[] = [
  // ── Fever & pain ──
  { code: 'PCM500', name: 'Paracetamol 500 mg Tablet', generic: 'Paracetamol', composition: 'Paracetamol IP 500 mg', category: 'Fever & pain',
    schedule: 'OTC', mrp: 30, offer: 26, gst: 5, hsn: '30049099', net: '15 tablets', form: 'tablet', partner: true,
    description: `Analgesic and antipyretic used for fever and mild to moderate pain. Do not exceed the stated dose. ${otc}` },
  { code: 'PCM650', name: 'Paracetamol 650 mg Tablet', generic: 'Paracetamol', composition: 'Paracetamol IP 650 mg', category: 'Fever & pain',
    schedule: 'OTC', mrp: 35, offer: 31, gst: 5, hsn: '30049099', net: '15 tablets', form: 'tablet',
    description: `Analgesic and antipyretic used for fever and body ache in adults. Do not exceed the stated dose. ${otc}` },
  { code: 'PCMSUS', name: 'Paracetamol 250 mg/5 ml Oral Suspension', generic: 'Paracetamol', composition: 'Paracetamol IP 250 mg per 5 ml',
    category: 'Fever & pain', schedule: 'OTC', mrp: 48, offer: 43, gst: 5, hsn: '30049099', net: '60 ml', form: 'liquid',
    description: `Oral suspension used for fever and pain in children. Dose by body weight using the measuring cup provided. ${otc}` },
  { code: 'IBU400', name: 'Ibuprofen 400 mg Tablet', generic: 'Ibuprofen', composition: 'Ibuprofen IP 400 mg', category: 'Fever & pain',
    schedule: 'Schedule H', mrp: 28, offer: 25, gst: 5, hsn: '30049099', net: '15 tablets', form: 'tablet', tele: 'A',
    description: `Non-steroidal anti-inflammatory medicine used for pain and inflammation. Take after food. ${rx}` },
  { code: 'DICGEL', name: 'Diclofenac Diethylamine 1.16% w/w Gel', generic: 'Diclofenac', composition: 'Diclofenac Diethylamine BP 1.16% w/w',
    category: 'Fever & pain', schedule: 'OTC', mrp: 115, offer: 99, gst: 5, hsn: '30049099', net: '30 g', form: 'tube',
    description: `Topical gel for local relief of muscle and joint pain. For external use only; do not apply on broken skin. ${otc}` },
  // ── Allergy ──
  { code: 'CTZ10', name: 'Cetirizine 10 mg Tablet', generic: 'Cetirizine', composition: 'Cetirizine Hydrochloride IP 10 mg', category: 'Allergy',
    schedule: 'OTC', mrp: 22, offer: 19, gst: 5, hsn: '30049099', net: '10 tablets', form: 'tablet', partner: true,
    description: `Antihistamine used for sneezing, runny nose and itching due to allergy. May cause drowsiness; avoid driving. ${otc}` },
  { code: 'LCZ5', name: 'Levocetirizine 5 mg Tablet', generic: 'Levocetirizine', composition: 'Levocetirizine Dihydrochloride IP 5 mg',
    category: 'Allergy', schedule: 'Schedule H', mrp: 48, offer: 42, gst: 5, hsn: '30049099', net: '10 tablets', form: 'tablet', tele: 'A',
    description: `Antihistamine used for allergic rhinitis and skin allergy. May cause drowsiness. ${rx}` },
  { code: 'FEX120', name: 'Fexofenadine 120 mg Tablet', generic: 'Fexofenadine', composition: 'Fexofenadine Hydrochloride IP 120 mg',
    category: 'Allergy', schedule: 'Schedule H', mrp: 185, offer: 162, gst: 5, hsn: '30049099', net: '10 tablets', form: 'tablet', tele: 'A',
    description: `Non-drowsy antihistamine used for seasonal allergic rhinitis and hives. ${rx}` },
  { code: 'MTKLCZ', name: 'Montelukast 10 mg + Levocetirizine 5 mg Tablet', generic: 'Montelukast + Levocetirizine',
    composition: 'Montelukast Sodium IP eq. to Montelukast 10 mg; Levocetirizine Dihydrochloride IP 5 mg', category: 'Allergy',
    schedule: 'Schedule H', mrp: 165, offer: 145, gst: 5, hsn: '30049099', net: '10 tablets', form: 'tablet', tele: 'A',
    description: `Combination used for allergic rhinitis. Usually taken once daily in the evening. ${rx}` },
  { code: 'CPM4', name: 'Chlorpheniramine Maleate 4 mg Tablet', generic: 'Chlorpheniramine', composition: 'Chlorpheniramine Maleate IP 4 mg',
    category: 'Allergy', schedule: 'OTC', mrp: 15, offer: 13, gst: 5, hsn: '30049099', net: '10 tablets', form: 'tablet',
    description: `Antihistamine used for common cold and allergy symptoms. Causes drowsiness; avoid alcohol and driving. ${otc}` },
  // ── Digestion ──
  { code: 'ORS', name: 'Oral Rehydration Salts (WHO formula) Powder', generic: 'Oral Rehydration Salts',
    composition: 'Sodium chloride, potassium chloride, sodium citrate and glucose (WHO reduced-osmolarity formula)', category: 'Digestion',
    schedule: 'OTC', mrp: 22, offer: 20, gst: 5, hsn: '30049099', net: '21.8 g sachet', form: 'sachet', partner: true,
    description: `Replaces fluids and salts lost through diarrhoea or vomiting. Dissolve one sachet in 1 litre of clean drinking water. ${otc}` },
  { code: 'PAN40', name: 'Pantoprazole 40 mg Gastro-resistant Tablet', generic: 'Pantoprazole', composition: 'Pantoprazole Sodium IP eq. to Pantoprazole 40 mg',
    category: 'Digestion', schedule: 'Schedule H', mrp: 158, offer: 136, gst: 5, hsn: '30049099', net: '15 tablets', form: 'tablet', tele: 'A',
    description: `Proton pump inhibitor used for acidity, heartburn and ulcers. Take before breakfast. ${rx}` },
  { code: 'OME20', name: 'Omeprazole 20 mg Capsule', generic: 'Omeprazole', composition: 'Omeprazole IP 20 mg (as enteric-coated pellets)',
    category: 'Digestion', schedule: 'Schedule H', mrp: 62, offer: 54, gst: 5, hsn: '30049099', net: '15 capsules', form: 'capsule', tele: 'A',
    description: `Proton pump inhibitor used for acidity and gastro-oesophageal reflux. ${rx}` },
  { code: 'DOM10', name: 'Domperidone 10 mg Tablet', generic: 'Domperidone', composition: 'Domperidone IP 10 mg', category: 'Digestion',
    schedule: 'Schedule H', mrp: 42, offer: 37, gst: 5, hsn: '30049099', net: '10 tablets', form: 'tablet', tele: 'A',
    description: `Used for nausea, vomiting and bloating. Take before meals. ${rx}` },
  { code: 'OND4', name: 'Ondansetron 4 mg Tablet', generic: 'Ondansetron', composition: 'Ondansetron Hydrochloride IP eq. to Ondansetron 4 mg',
    category: 'Digestion', schedule: 'Schedule H', mrp: 64, offer: 56, gst: 5, hsn: '30049099', net: '10 tablets', form: 'tablet', tele: 'A',
    description: `Used to prevent and treat nausea and vomiting. ${rx}` },
  { code: 'ANTACID', name: 'Aluminium Hydroxide + Magnesium Hydroxide + Simethicone Oral Suspension', generic: 'Antacid with Simethicone',
    composition: 'Dried Aluminium Hydroxide Gel IP 250 mg, Magnesium Hydroxide IP 250 mg, Simethicone IP 50 mg per 10 ml', category: 'Digestion',
    schedule: 'OTC', mrp: 135, offer: 118, gst: 5, hsn: '30049099', net: '170 ml', form: 'liquid',
    description: `Antacid for acidity, heartburn and gas. Take after meals. ${otc}` },
  { code: 'ISAB', name: 'Ispaghula Husk Powder', generic: 'Ispaghula (Psyllium) Husk', composition: 'Ispaghula Husk IP 3.5 g per 5 g',
    category: 'Digestion', schedule: 'OTC', mrp: 145, offer: 128, gst: 5, hsn: '30049099', net: '100 g', form: 'pack',
    description: `Dietary fibre used for constipation. Mix in a full glass of water and drink at once. ${otc}` },
  // ── Diabetes ──
  { code: 'MET500', name: 'Metformin 500 mg Tablet', generic: 'Metformin', composition: 'Metformin Hydrochloride IP 500 mg', category: 'Diabetes',
    schedule: 'Schedule H', mrp: 36, offer: 31, gst: 5, hsn: '30049099', net: '20 tablets', form: 'tablet', tele: 'B',
    description: `Used with diet and exercise to control blood sugar in type 2 diabetes. Take with meals. ${rx}` },
  { code: 'GLM1', name: 'Glimepiride 1 mg Tablet', generic: 'Glimepiride', composition: 'Glimepiride IP 1 mg', category: 'Diabetes',
    schedule: 'Schedule H', mrp: 62, offer: 54, gst: 5, hsn: '30049099', net: '10 tablets', form: 'tablet', tele: 'B',
    description: `Used to control blood sugar in type 2 diabetes. Take with breakfast; do not skip meals. ${rx}` },
  { code: 'METGLM', name: 'Metformin 500 mg + Glimepiride 1 mg Tablet', generic: 'Metformin + Glimepiride',
    composition: 'Metformin Hydrochloride IP 500 mg (prolonged release); Glimepiride IP 1 mg', category: 'Diabetes',
    schedule: 'Schedule H', mrp: 92, offer: 80, gst: 5, hsn: '30049099', net: '10 tablets', form: 'tablet', tele: 'B',
    description: `Combination used to control blood sugar in type 2 diabetes. ${rx}` },
  { code: 'SITA50', name: 'Sitagliptin 50 mg Tablet', generic: 'Sitagliptin', composition: 'Sitagliptin Phosphate IP eq. to Sitagliptin 50 mg',
    category: 'Diabetes', schedule: 'Schedule H', mrp: 225, offer: 196, gst: 5, hsn: '30049099', net: '15 tablets', form: 'tablet', tele: 'B',
    description: `Used with diet and exercise to control blood sugar in type 2 diabetes. ${rx}` },
  { code: 'VILDA50', name: 'Vildagliptin 50 mg Tablet', generic: 'Vildagliptin', composition: 'Vildagliptin IP 50 mg', category: 'Diabetes',
    schedule: 'Schedule H', mrp: 255, offer: 222, gst: 5, hsn: '30049099', net: '15 tablets', form: 'tablet', tele: 'B',
    description: `Used to control blood sugar in type 2 diabetes. ${rx}` },
  // ── Heart & BP ──
  { code: 'AML5', name: 'Amlodipine 5 mg Tablet', generic: 'Amlodipine', composition: 'Amlodipine Besilate IP eq. to Amlodipine 5 mg',
    category: 'Heart & BP', schedule: 'Schedule H', mrp: 46, offer: 40, gst: 5, hsn: '30049099', net: '15 tablets', form: 'tablet', tele: 'B',
    description: `Calcium channel blocker used for high blood pressure. Take at the same time every day. ${rx}` },
  { code: 'TEL40', name: 'Telmisartan 40 mg Tablet', generic: 'Telmisartan', composition: 'Telmisartan IP 40 mg', category: 'Heart & BP',
    schedule: 'Schedule H', mrp: 98, offer: 85, gst: 5, hsn: '30049099', net: '15 tablets', form: 'tablet', tele: 'B',
    description: `Used for high blood pressure. Take at the same time every day. ${rx}` },
  { code: 'LOS50', name: 'Losartan Potassium 50 mg Tablet', generic: 'Losartan', composition: 'Losartan Potassium IP 50 mg', category: 'Heart & BP',
    schedule: 'Schedule H', mrp: 88, offer: 76, gst: 5, hsn: '30049099', net: '15 tablets', form: 'tablet', tele: 'B',
    description: `Used for high blood pressure. ${rx}` },
  { code: 'ATOR10', name: 'Atorvastatin 10 mg Tablet', generic: 'Atorvastatin', composition: 'Atorvastatin Calcium IP eq. to Atorvastatin 10 mg',
    category: 'Heart & BP', schedule: 'Schedule H', mrp: 112, offer: 97, gst: 5, hsn: '30049099', net: '15 tablets', form: 'tablet', tele: 'B',
    description: `Used with diet to lower cholesterol. Usually taken once daily at night. ${rx}` },
  { code: 'MTP25', name: 'Metoprolol Succinate 25 mg Extended-release Tablet', generic: 'Metoprolol',
    composition: 'Metoprolol Succinate IP eq. to Metoprolol Tartrate 25 mg', category: 'Heart & BP',
    schedule: 'Schedule H', mrp: 92, offer: 80, gst: 5, hsn: '30049099', net: '15 tablets', form: 'tablet', tele: 'B',
    description: `Beta blocker used for high blood pressure and heart conditions. Do not stop suddenly. ${rx}` },
  { code: 'ASP75', name: 'Aspirin 75 mg Gastro-resistant Tablet', generic: 'Aspirin', composition: 'Aspirin IP 75 mg (gastro-resistant)',
    category: 'Heart & BP', schedule: 'Schedule H', mrp: 14, offer: 12, gst: 5, hsn: '30049099', net: '14 tablets', form: 'tablet', tele: 'B',
    description: `Low-dose antiplatelet medicine. Take after food. ${rx}` },
  // ── Antibiotics (prescription only) ──
  { code: 'AMX500', name: 'Amoxicillin 500 mg Capsule', generic: 'Amoxicillin', composition: 'Amoxicillin Trihydrate IP eq. to Amoxicillin 500 mg',
    category: 'Antibiotics', schedule: 'Schedule H', mrp: 92, offer: 80, gst: 5, hsn: '30041010', net: '10 capsules', form: 'capsule', tele: 'A',
    description: `Penicillin antibiotic for bacterial infections. Complete the full course. ${rx}` },
  { code: 'AMXCLV', name: 'Amoxicillin 500 mg + Clavulanic Acid 125 mg Tablet', generic: 'Amoxicillin + Clavulanic Acid',
    composition: 'Amoxicillin Trihydrate IP eq. to Amoxicillin 500 mg; Potassium Clavulanate IP eq. to Clavulanic Acid 125 mg', category: 'Antibiotics',
    schedule: 'Schedule H', mrp: 205, offer: 178, gst: 5, hsn: '30041010', net: '6 tablets', form: 'tablet', tele: 'A',
    description: `Antibiotic combination for bacterial infections. Take with food and complete the full course. ${rx}` },
  { code: 'AZI500', name: 'Azithromycin 500 mg Tablet', generic: 'Azithromycin', composition: 'Azithromycin IP (as dihydrate) 500 mg',
    category: 'Antibiotics', schedule: 'Schedule H', mrp: 122, offer: 106, gst: 5, hsn: '30042019', net: '3 tablets', form: 'tablet', tele: 'A',
    description: `Macrolide antibiotic for bacterial infections. Complete the full course. ${rx}` },
  { code: 'CFX200', name: 'Cefixime 200 mg Tablet', generic: 'Cefixime', composition: 'Cefixime IP (as trihydrate) 200 mg', category: 'Antibiotics',
    schedule: 'Schedule H1', mrp: 112, offer: 98, gst: 5, hsn: '30042014', net: '10 tablets', form: 'tablet', tele: null,
    description: `Cephalosporin antibiotic. Schedule H1: sold only against a valid prescription, recorded in the H1 register. ${rx}` },
  { code: 'DOX100', name: 'Doxycycline 100 mg Capsule', generic: 'Doxycycline', composition: 'Doxycycline Hydrochloride IP eq. to Doxycycline 100 mg',
    category: 'Antibiotics', schedule: 'Schedule H', mrp: 64, offer: 56, gst: 5, hsn: '30042019', net: '10 capsules', form: 'capsule', tele: 'A',
    description: `Tetracycline antibiotic. Take with a full glass of water, sitting upright. ${rx}` },
  // ── Vitamins ──
  { code: 'VITC500', name: 'Vitamin C 500 mg Chewable Tablet', generic: 'Ascorbic Acid', composition: 'Ascorbic Acid IP 500 mg', category: 'Vitamins',
    schedule: 'OTC', mrp: 32, offer: 28, gst: 5, hsn: '30045020', net: '15 tablets', form: 'tablet', partner: true,
    description: `Vitamin C supplement. Chew one tablet a day or as directed. ${otc}` },
  { code: 'BCOMP', name: 'Vitamin B-Complex Capsule', generic: 'Vitamin B-Complex', composition: 'Thiamine, Riboflavin, Niacinamide, Pyridoxine, Cyanocobalamin',
    category: 'Vitamins', schedule: 'OTC', mrp: 48, offer: 42, gst: 5, hsn: '30045039', net: '30 capsules', form: 'capsule',
    description: `B-vitamin supplement. One capsule a day after food or as directed. ${otc}` },
  { code: 'CALD3', name: 'Calcium Carbonate 500 mg + Vitamin D3 250 IU Tablet', generic: 'Calcium + Vitamin D3',
    composition: 'Calcium Carbonate IP eq. to elemental Calcium 500 mg; Cholecalciferol IP 250 IU', category: 'Vitamins',
    schedule: 'OTC', mrp: 115, offer: 99, gst: 5, hsn: '30045020', net: '15 tablets', form: 'tablet', partnerOnly: true, partner: true,
    description: `Calcium and vitamin D3 supplement. Take after food. ${otc}` },
  { code: 'D3K60', name: 'Cholecalciferol 60,000 IU Capsule', generic: 'Cholecalciferol (Vitamin D3)', composition: 'Cholecalciferol IP 60,000 IU',
    category: 'Vitamins', schedule: 'Schedule H', mrp: 135, offer: 118, gst: 5, hsn: '30045036', net: '4 capsules', form: 'capsule', tele: 'A',
    description: `High-strength vitamin D3, usually taken once a week. ${rx}` },
  // ── First aid ──
  { code: 'PVI5', name: 'Povidone-Iodine 5% w/v Solution', generic: 'Povidone-Iodine', composition: 'Povidone-Iodine IP 5% w/v', category: 'First aid',
    schedule: 'OTC', mrp: 112, offer: 98, gst: 5, hsn: '30049099', net: '100 ml', form: 'liquid', partner: true,
    description: `Antiseptic solution for cleaning minor cuts and wounds. For external use only. ${otc}` },
  { code: 'CETCRM', name: 'Cetrimide 0.5% w/w Antiseptic Cream', generic: 'Cetrimide', composition: 'Cetrimide IP 0.5% w/w', category: 'First aid',
    schedule: 'OTC', mrp: 62, offer: 55, gst: 5, hsn: '30049099', net: '30 g', form: 'tube',
    description: `Antiseptic cream for minor cuts, scrapes and burns. For external use only. ${otc}` },
  { code: 'BANDS', name: 'Adhesive Bandage Strips (assorted)', generic: 'Adhesive bandage', composition: 'Sterile adhesive dressing strips',
    category: 'First aid', schedule: 'OTC', mrp: 50, offer: 45, gst: 12, hsn: '30051090', net: '20 strips', form: 'pack',
    description: `Sterile strips for covering minor cuts and grazes. Clean and dry the skin before applying.` },
  { code: 'GAUZE', name: 'Sterile Gauze Swabs 10 cm x 10 cm', generic: 'Gauze swab', composition: 'Absorbent cotton gauze, sterile',
    category: 'First aid', schedule: 'OTC', mrp: 65, offer: 58, gst: 12, hsn: '30059040', net: '10 swabs', form: 'pack',
    description: `Sterile gauze for cleaning and dressing wounds. Single use; do not use if the pack is open.` },
  { code: 'THERMO', name: 'Digital Clinical Thermometer', generic: 'Clinical thermometer', composition: 'Digital oral/axillary thermometer',
    category: 'First aid', schedule: 'OTC', mrp: 260, offer: 225, gst: 12, hsn: '90251990', net: '1 unit', form: 'device',
    description: `Digital thermometer for oral or underarm use. Clean the tip before and after each use.` },
];
