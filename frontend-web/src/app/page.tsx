'use client';
import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, MapPin, ChevronRight, Package } from 'lucide-react';
import Link from 'next/link';
import api from '@/lib/api';
import { useCartStore } from '@/store/cartStore';
import { toast } from 'sonner';
import Header from '@/components/layout/Header';
import ProductCard from '@/components/shop/ProductCard';
import CategoryChips from '@/components/shop/CategoryChips';
import PinCodeBanner from '@/components/shop/PinCodeBanner';

export default function HomePage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [pincode, setPincode] = useState('');
  const { addItem } = useCartStore();

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(searchQuery), 400);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Load saved pincode
  useEffect(() => {
    const saved = localStorage.getItem('dawabag_pincode');
    if (saved) setPincode(saved);
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

  const { data: categoriesData } = useQuery({
    queryKey: ['categories'],
    queryFn: async () => {
      const { data } = await api.get('/products/categories');
      return data.data;
    },
  });

  const handleAddToCart = (product: any) => {
    if (['NDPS', 'Schedule X'].includes(product.drug_schedule)) {
      toast.error('This medicine cannot be ordered online.');
      return;
    }
    if (!product.in_stock) {
      toast.error('Out of stock');
      return;
    }
    addItem({
      product_id: product.id,
      name: product.name,
      sku: product.sku,
      unit_price_paise: product.offer_price_paise,
      mrp_paise: product.mrp_paise,
      drug_schedule: product.drug_schedule,
      max_qty: product.max_qty_per_order,
      cold_chain: product.cold_chain,
      image_key: product.s3_image_key,
    });
    toast.success(`${product.name} added to cart`);
  };

  const handlePincodeChange = (newPincode: string) => {
    setPincode(newPincode);
    localStorage.setItem('dawabag_pincode', newPincode);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <main className="max-w-6xl mx-auto px-4 py-6">

        {/* Pin code banner */}
        <PinCodeBanner
          pincode={pincode}
          onPincodeChange={handlePincodeChange}
          pincodeInfo={data?.pincode_info}
        />

        {/* Search bar */}
        <div className="relative mb-6">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by brand name or generic name..."
            className="w-full pl-12 pr-4 py-3 rounded-xl border border-gray-200 bg-white text-sm
                       focus:outline-none focus:ring-2 focus:ring-brand-400 shadow-sm"
          />
        </div>

        {/* Category chips */}
        <CategoryChips
          categories={categoriesData || []}
          selected={selectedCategory}
          onSelect={setSelectedCategory}
        />

        {/* Results */}
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="card animate-pulse h-40 bg-gray-100" />
            ))}
          </div>
        ) : data?.products?.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <Package className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p className="text-lg">No medicines found</p>
            <p className="text-sm mt-1">Try a different search term or category</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {data?.products?.map((product: any) => (
              <ProductCard
                key={product.id}
                product={product}
                onAddToCart={handleAddToCart}
              />
            ))}
          </div>
        )}

        {/* Pagination */}
        {data?.pagination && data.pagination.pages > 1 && (
          <div className="flex justify-center mt-8 gap-2">
            {[...Array(data.pagination.pages)].map((_, i) => (
              <button key={i} className="w-8 h-8 rounded-lg border text-sm hover:bg-brand-50">
                {i + 1}
              </button>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
