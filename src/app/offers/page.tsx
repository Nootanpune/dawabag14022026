// =====================================================
// DAWABAG - Offers Page
// =====================================================

"use client";

import { useState } from 'react';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import Button from '@/components/ui/Button';

const offers = [
  {
    id: 1,
    title: 'Flat 20% Off on All Medicines',
    description: 'Get flat 20% discount on all prescription medicines. Apply code HEALTH20 at checkout.',
    code: 'HEALTH20',
    discount: 20,
    type: 'percentage',
    minOrder: 0,
    maxDiscount: 500,
    expiresAt: '2026-03-31',
    category: 'All Medicines',
    isFeatured: true,
    image: '💊',
  },
  {
    id: 2,
    title: 'First Order Discount',
    description: 'Get 25% off on your first order. Use code FIRST25 for extra savings!',
    code: 'FIRST25',
    discount: 25,
    type: 'percentage',
    minOrder: 299,
    maxDiscount: 200,
    expiresAt: '2026-03-31',
    category: 'New Users',
    isFeatured: true,
    image: '🎉',
  },
  {
    id: 3,
    title: 'Free Shipping on Orders Above ₹499',
    description: 'No delivery charges on orders above ₹499. Valid on all products.',
    code: 'FREE shipping',
    discount: 49,
    type: 'shipping',
    minOrder: 499,
    maxDiscount: 0,
    expiresAt: '2026-04-15',
    category: 'Shipping',
    isFeatured: false,
    image: '🚚',
  },
  {
    id: 4,
    title: '₹100 Off on Orders Above ₹799',
    description: 'Get ₹100 off on orders above ₹799. Use code SAVE100.',
    code: 'SAVE100',
    discount: 100,
    type: 'fixed',
    minOrder: 799,
    maxDiscount: 0,
    expiresAt: '2026-03-15',
    category: 'All Medicines',
    isFeatured: false,
    image: '💰',
  },
  {
    id: 5,
    title: '15% Off on Vitamins & Supplements',
    description: 'Boost your immunity with 15% off on all vitamins and supplements.',
    code: 'VITAMINS15',
    discount: 15,
    type: 'percentage',
    minOrder: 0,
    maxDiscount: 300,
    expiresAt: '2026-04-01',
    category: 'Vitamins',
    isFeatured: false,
    image: '💊',
  },
  {
    id: 6,
    title: 'Doctor Referral Bonus',
    description: 'Refer a doctor and earn ₹500 for every successful referral.',
    code: 'Referral',
    discount: 500,
    type: 'referral',
    minOrder: 0,
    maxDiscount: 0,
    expiresAt: '2026-12-31',
    category: 'Referral',
    isFeatured: true,
    image: '👨‍⚕️',
  },
];

const categories = ['All', 'All Medicines', 'New Users', 'Shipping', 'Vitamins', 'Referral'];

export default function OffersPage() {
  const [selectedCategory, setSelectedCategory] = useState('All');

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Hero Banner */}
        <div className="bg-gradient-to-r from-teal-500 to-teal-700 rounded-xl p-8 mb-8 text-white">
          <h1 className="text-3xl font-bold mb-2">Exciting Offers & Discounts</h1>
          <p className="text-teal-100">Save big on your medicine purchases with our exclusive offers</p>
        </div>

        {/* Category Filter */}
        <div className="flex flex-wrap gap-2 mb-8">
          {categories.map((category) => (
            <button
              key={category}
              onClick={() => setSelectedCategory(category)}
              className={`px-4 py-2 rounded-full text-sm font-medium ${
                selectedCategory === category
                  ? 'bg-teal-600 text-white'
                  : 'bg-white text-gray-600 hover:bg-gray-100'
              }`}
            >
              {category}
            </button>
          ))}
        </div>

        {/* Featured Offers */}
        {selectedCategory === 'All' && (
          <div className="mb-8">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Featured Offers</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {offers
                .filter((offer) => offer.isFeatured)
                .map((offer) => (
                  <div key={offer.id} className="bg-white rounded-xl shadow-sm p-6 border-2 border-teal-500">
                    <div className="flex items-start">
                      <div className="text-4xl mr-4">{offer.image}</div>
                      <div className="flex-1">
                        <h3 className="font-bold text-gray-900">{offer.title}</h3>
                        <p className="text-gray-600 mt-1">{offer.description}</p>
                        <div className="flex items-center mt-4">
                          <span className="bg-teal-100 text-teal-700 px-3 py-1 rounded-full text-sm font-mono">
                            {offer.code}
                          </span>
                          <span className="ml-4 text-sm text-gray-500">
                            Min order: ₹{offer.minOrder}
                          </span>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="block text-3xl font-bold text-teal-600">
                          {offer.type === 'percentage' ? `${offer.discount}%` : `₹${offer.discount}`}
                        </span>
                        <span className="text-xs text-gray-500">off</span>
                      </div>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* All Offers */}
        <div>
          <h2 className="text-xl font-bold text-gray-900 mb-4">
            {selectedCategory === 'All' ? 'All Offers' : `${selectedCategory} Offers`}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {offers
              .filter((offer) => selectedCategory === 'All' || offer.category === selectedCategory)
              .map((offer) => (
                <div key={offer.id} className="bg-white rounded-lg shadow-sm p-6 hover:shadow-md transition-shadow">
                  <div className="flex items-start mb-4">
                    <div className="text-3xl">{offer.image}</div>
                    <div className="ml-3">
                      <span className="bg-teal-100 text-teal-700 px-2 py-1 rounded text-xs font-mono">
                        {offer.code}
                      </span>
                    </div>
                  </div>

                  <h3 className="font-semibold text-gray-900">{offer.title}</h3>
                  <p className="text-sm text-gray-600 mt-1">{offer.description}</p>

                  <div className="flex items-center justify-between mt-4 pt-4 border-t">
                    <div>
                      <span className="text-lg font-bold text-teal-600">
                        {offer.type === 'percentage' ? `${offer.discount}%` : offer.type === 'fixed' ? `₹${offer.discount}` : 'Free'}
                      </span>
                      <span className="text-sm text-gray-500 ml-1">off</span>
                      {offer.maxDiscount > 0 && (
                        <p className="text-xs text-gray-400">Max ₹{offer.maxDiscount}</p>
                      )}
                    </div>
                    <Button size="sm" variant="outline">
                      Apply
                    </Button>
                  </div>

                  <p className="text-xs text-gray-400 mt-3">
                    Valid till {new Date(offer.expiresAt).toLocaleDateString('en-IN')}
                  </p>
                </div>
              ))}
          </div>
        </div>

        {/* How to Use */}
        <div className="mt-12 bg-white rounded-lg shadow-sm p-8">
          <h2 className="text-xl font-bold text-gray-900 mb-4">How to Use Coupon Codes</h2>
          <ol className="space-y-4">
            <li className="flex items-start">
              <span className="w-8 h-8 bg-teal-100 text-teal-600 rounded-full flex items-center justify-center font-bold mr-4">1</span>
              <div>
                <p className="font-medium">Browse and add medicines to your cart</p>
                <p className="text-sm text-gray-500">Add the medicines you need to your shopping cart</p>
              </div>
            </li>
            <li className="flex items-start">
              <span className="w-8 h-8 bg-teal-100 text-teal-600 rounded-full flex items-center justify-center font-bold mr-4">2</span>
              <div>
                <p className="font-medium">Apply the coupon code</p>
                <p className="text-sm text-gray-500">Enter the coupon code in the 'Apply Coupon' section on cart page</p>
              </div>
            </li>
            <li className="flex items-start">
              <span className="w-8 h-8 bg-teal-100 text-teal-600 rounded-full flex items-center justify-center font-bold mr-4">3</span>
              <div>
                <p className="font-medium">Avail discount</p>
                <p className="text-sm text-gray-500">The discount will be applied to your order total</p>
              </div>
            </li>
          </ol>
        </div>

        {/* Terms */}
        <div className="mt-8 text-sm text-gray-500">
          <p>* All offers are valid until the expiry date mentioned.</p>
          <p>* Only one coupon code can be applied per order.</p>
          <p>* Offers are not applicable on certain products as per terms.</p>
          <p>* Dawabag reserves the right to modify or withdraw offers at any time.</p>
        </div>
      </div>

      <Footer />
    </div>
  );
}
