// =====================================================
// DAWABAG - Customer Header Component
// =====================================================

"use client";

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

interface HeaderProps {
  onCartClick?: () => void;
  onAuthClick?: () => void;
}

export default function Header({ onCartClick, onAuthClick }: HeaderProps) {
  const router = useRouter();
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [user, setUser] = useState<{ name: string; email: string } | null>(null);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [pincode, setPincode] = useState('');
  const [pincodeService, setPincodeService] = useState<{
    pincode: string;
    deliveryDays: number;
  } | null>(null);
  const [cartCount, setCartCount] = useState(0);

  useEffect(() => {
    // Check auth status
    const savedUser = localStorage.getItem('dawabag_user');
    if (savedUser) {
      setUser(JSON.parse(savedUser));
      setIsLoggedIn(true);
    }

    // Check pincode
    const savedPincode = localStorage.getItem('dawabag_pincode');
    if (savedPincode) {
      setPincode(savedPincode);
      setPincodeService({ pincode: savedPincode, deliveryDays: 3 });
    }

    // Check cart
    const savedCart = localStorage.getItem('dawabag_cart');
    if (savedCart) {
      const cart = JSON.parse(savedCart);
      const count = cart.items?.reduce((sum: number, item: { quantity: number }) => sum + item.quantity, 0) || 0;
      setCartCount(count);
    }
  }, []);

  const handlePincodeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (pincode.length === 6) {
      localStorage.setItem('dawabag_pincode', pincode);
      setPincodeService({ pincode, deliveryDays: 3 });
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('dawabag_user');
    localStorage.removeItem('dawabag_token');
    setUser(null);
    setIsLoggedIn(false);
    setShowUserMenu(false);
    router.push('/');
  };

  return (
    <header className="bg-white shadow-sm sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link href="/" className="flex items-center">
            <span className="text-2xl font-bold text-teal-600">Dawabag</span>
          </Link>

          {/* Search Bar */}
          <div className="flex-1 max-w-2xl mx-8">
            <div className="relative">
              <input
                type="text"
                placeholder="Search medicines by brand, generic name or salt..."
                className="w-full px-4 py-2 pl-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
              />
              <svg
                className="absolute left-3 top-2.5 h-5 w-5 text-gray-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
            </div>
          </div>

          {/* Pincode Selector */}
          <form onSubmit={handlePincodeSubmit} className="flex items-center mr-4">
            <div className="relative">
              <input
                type="text"
                placeholder="Enter PIN"
                value={pincode}
                onChange={(e) => setPincode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                className="w-24 px-3 py-1.5 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-teal-500"
              />
            </div>
            {pincodeService && (
              <span className="ml-2 text-xs text-green-600 font-medium">
                {pincodeService.deliveryDays} days
              </span>
            )}
          </form>

          {/* Auth & Cart */}
          <div className="flex items-center space-x-4">
            {isLoggedIn ? (
              <div className="relative">
                <button
                  onClick={() => setShowUserMenu(!showUserMenu)}
                  className="flex items-center space-x-1 text-gray-700 hover:text-teal-600"
                >
                  <div className="h-8 w-8 rounded-full bg-teal-100 flex items-center justify-center">
                    <span className="text-teal-600 font-medium">
                      {user?.name?.charAt(0).toUpperCase() || 'U'}
                    </span>
                  </div>
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {showUserMenu && (
                  <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg py-2 z-50">
                    <div className="px-4 py-2 border-b">
                      <p className="text-sm font-medium text-gray-900">{user?.name}</p>
                      <p className="text-xs text-gray-500">{user?.email}</p>
                    </div>
                    <Link href="/customer/profile" className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">
                      My Profile
                    </Link>
                    <Link href="/customer/orders" className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">
                      My Orders
                    </Link>
                    <Link href="/customer/prescriptions" className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">
                      Prescriptions
                    </Link>
                    <Link href="/customer/addresses" className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">
                      Addresses
                    </Link>
                    <button
                      onClick={handleLogout}
                      className="block w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-gray-100"
                    >
                      Logout
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <button
                onClick={onAuthClick}
                className="text-gray-700 hover:text-teal-600 font-medium"
              >
                Login / Sign Up
              </button>
            )}

            {/* Cart Button */}
            <button
              onClick={onCartClick}
              className="relative p-2 text-gray-700 hover:text-teal-600"
            >
              <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"
                />
              </svg>
              {cartCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-teal-600 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center">
                  {cartCount}
                </span>
              )}
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
