// =====================================================
// DAWABAG - Doctor Login Page
// =====================================================

"use client";

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';

export default function DoctorLoginPage() {
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
      const doctor = {
        id: 'doc_' + Date.now(),
        name: 'Dr. Rajesh Kumar',
        email: formData.email,
        specialty: 'General Physician',
        referralCode: 'DRRAJESH',
      };
      localStorage.setItem('dawabag_doctor', JSON.stringify(doctor));
      setIsLoading(false);
      router.push('/doctor/dashboard');
    }, 1000);
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="text-center">
          <Link href="/" className="text-3xl font-bold text-teal-600">Dawabag</Link>
          <h2 className="mt-6 text-center text-2xl font-bold text-gray-900">Doctor Portal</h2>
          <p className="mt-2 text-center text-sm text-gray-600">Sign in to manage referrals and patients</p>
        </div>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
          <form onSubmit={handleSubmit} className="space-y-6">
            <Input
              label="Email Address"
              type="email"
              placeholder="doctor@example.com"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              error={errors.email}
            />

            <Input
              label="Password"
              type="password"
              placeholder="Enter your password"
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              error={errors.password}
            />

            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <input id="remember-me" type="checkbox" className="h-4 w-4 text-teal-600" />
                <label htmlFor="remember-me" className="ml-2 text-sm text-gray-600">Remember me</label>
              </div>
              <div className="text-sm">
                <a href="#" className="font-medium text-teal-600 hover:text-teal-500">Forgot password?</a>
              </div>
            </div>

            <Button type="submit" isLoading={isLoading} className="w-full">Sign In</Button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-sm text-gray-600">
              New doctor?{' '}
              <Link href="/doctor/signup" className="font-medium text-teal-600 hover:text-teal-500">
                Register here
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
