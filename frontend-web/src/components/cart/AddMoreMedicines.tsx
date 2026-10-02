'use client';
import SearchCombobox from '@/components/search/SearchCombobox';

/** "Add more medicines" without leaving the cart: suggestions with a quick Add (server cart). */
export default function AddMoreMedicines() {
  return (
    <section aria-labelledby="add-more-heading" className="card">
      <h2 id="add-more-heading" className="text-sm font-semibold mb-2">Add more medicines</h2>
      <SearchCombobox id="cart-add-search" label="Add more medicines" placeholder="Search by brand or generic name" />
    </section>
  );
}
