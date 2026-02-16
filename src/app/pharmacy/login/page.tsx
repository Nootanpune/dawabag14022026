// =====================================================
// DAWABAG - Pharmacy Login Page
// =====================================================

"use client";

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';

export default function PharmacyLoginPage() {
  const router = useRouter();
  const [formData, setFormData] = useState({ email: '', password: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const newErrors: Record<string, string> = {};
    if (!formData.email) newErrors.email = 'Email is required';
    if (!formData.password) newErrors.password = 'Password is required';
    setErrors(newErrors);
    if (Object.keys(newErrors).length > 0) return;

    setIsLoading(true);
    setTimeout(() => {
      const pharmacy = {
        id: 'pharm_' + Date.now(),
        name: 'Apollo Pharmacy',
        email: formData.email,
        city: 'Mumbai',
        creditLimit: 50000,
        creditUsed: 12500,
      };
      localStorage.setItem('dawabag_pharmacy', JSON.stringify(pharmacy));
      setIsLoading(false);
      router.push('/pharmacy/dashboard');
    }, 1000);
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="text-center">
          <Link href="/" className="text-3xl font-bold text-teal-600">Dawabag</Link>
          <h2 className="mt-6 text-center text-2xl font-bold text-gray-900">Pharmacy Portal</h2>
          <p className="mt-2 text-center text-sm text-gray-600">B2B medicine ordering for pharmacies</p>
        </div>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
          <form onSubmit={handleSubmit} className="space-y-6">
            <Input label="Email" type="email" value={formData.email} onChange={(e) => setFormData({...formData, email: e.target.value})} error={errors.email} />
            <Input label="Password" type="password" value={formData.password} onChange={(e) => setFormData({...formData, password: e.target.value})} error={errors.password} />
            <Button type="submit" isLoading={isLoading} className="w-full">Sign In</Button>
          </form>
          <div className="mt-6 text-center">
            <p className="text-sm text-gray-600">New pharmacy? <Link href="/pharmacy/signup" className="font-medium text-teal-600">Register here</Link></p>
          </div>
        </div>
      </div>
    </div>
  );
}
