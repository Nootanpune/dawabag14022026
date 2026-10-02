'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import { usePincode } from '@/hooks/usePincode';
import Header from '@/components/layout/Header';
import PinCodeBanner from '@/components/shop/PinCodeBanner';
import TrustStrip from '@/components/home/TrustStrip';
import HomeHero from '@/components/home/HomeHero';
import FreeDeliveryNote from '@/components/home/FreeDeliveryNote';
import PrescriptionCta from '@/components/home/PrescriptionCta';
import CategoryTiles, { type Category } from '@/components/home/CategoryTiles';
import ProductResults from '@/components/home/ProductResults';

// Home: the search (suggestions as you type, Enter → /search), then categories and popular medicines
export default function HomePage() {
  const [selectedCategory, setSelectedCategory] = useState('');
  const { pincode, setPincode } = usePincode();

  const { data, isLoading } = useQuery({
    queryKey: ['products', '', selectedCategory, pincode],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (selectedCategory) params.set('category', selectedCategory);
      if (pincode) params.set('pincode', pincode);
      params.set('limit', '20');
      const { data } = await api.get(`/products/search?${params}`);
      return data.data;
    },
  });

  const { data: categoriesData } = useQuery<Category[]>({
    queryKey: ['categories'],
    queryFn: async () => {
      const { data } = await api.get('/products/categories');
      return data.data;
    },
  });

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <main className="max-w-6xl mx-auto px-4 py-4 sm:py-6">
        <HomeHero note={<FreeDeliveryNote />} />
        <TrustStrip />
        <PinCodeBanner pincode={pincode} onPincodeChange={setPincode} pincodeInfo={data?.pincode_info} />
        <PrescriptionCta />
        <CategoryTiles categories={categoriesData || []} selected={selectedCategory} onSelect={setSelectedCategory} />
        <ProductResults
          products={data?.products}
          isLoading={isLoading}
          query=""
          category={selectedCategory}
          onReset={() => setSelectedCategory('')}
        />
      </main>
    </div>
  );
}
