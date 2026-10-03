import PractitionerSalesRegister from '@/components/registers/PractitionerSalesRegister';

/** Sprint 44: the partner's own sales to doctors and institutions — it is the licensee (FDA Pune circular 16/2026). */
export default function PartnerPractitionerSalesPage() {
  return <PractitionerSalesRegister scope="partner" />;
}
