'use client';
import { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import { useAddToCart } from '@/hooks/useCart';
import { usePincode } from '@/hooks/usePincode';
import { toast } from 'sonner';
import Header from '@/components/layout/Header';
import PinCodeBanner from '@/components/shop/PinCodeBanner';
import TrustStrip from '@/components/home/TrustStrip';
import HomeHero from '@/components/home/HomeHero';
import PrescriptionCta from '@/components/home/PrescriptionCta';
import CategoryTiles, { type Category } from '@/components/home/CategoryTiles';
import ProductResults from '@/components/home/ProductResults';

export default function HomePage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  const { pincode, setPincode } = usePincode();
  const { addToCart, isPending: isAdding, pendingProductId } = useAddToCart();

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(searchQuery), 400);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // The bottom nav's "Search" opens /?focus=search
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('focus') === 'search') {
      searchRef.current?.focus();
      searchRef.current?.scrollIntoView({ block: 'center' });
    }
  }, []);

  const { data, isLoading } = useQuery({
    queryKey: ['products', debouncedQuery, selectedCategory, pincode],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (debouncedQuery) params.set('q', debouncedQuery);
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

  // Schedule X / NDPS are never sold online (C-10); the server enforces it too
  const handleAddToCart = (product: any) => {
    if (['NDPS', 'Schedule X'].includes(product.drug_schedule)) {
      toast.error('This medicine cannot be ordered online.');
      return;
    }
    if (!product.in_stock) {
      toast.error('Out of stock');
      return;
    }
    addToCart(product.id, product.name);
  };

  const resetFilters = () => {
    setSearchQuery('');
    setDebouncedQuery('');
    setSelectedCategory('');
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <main className="max-w-6xl mx-auto px-4 py-5 sm:py-6">
        <HomeHero query={searchQuery} onQueryChange={setSearchQuery} inputRef={searchRef} />
        <TrustStrip />
        <PinCodeBanner pincode={pincode} onPincodeChange={setPincode} pincodeInfo={data?.pincode_info} />
        <PrescriptionCta />
        <CategoryTiles categories={categoriesData || []} selected={selectedCategory} onSelect={setSelectedCategory} />
        <ProductResults
          products={data?.products}
          isLoading={isLoading}
          query={debouncedQuery}
          category={selectedCategory}
          onAddToCart={handleAddToCart}
          pendingProductId={isAdding ? pendingProductId : undefined}
          onReset={resetFilters}
        />
      </main>
    </div>
  );
}
