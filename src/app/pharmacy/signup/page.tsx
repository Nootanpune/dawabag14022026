// =====================================================
// DAWABAG - Pharmacy Signup Page
// =====================================================

"use client";

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';

export default function PharmacySignupPage() {
  const router = useRouter();
  const [formData, setFormData] = useState({
    pharmacyName: '', ownerName: '', email: '', mobile: '',
    drugLicense: '', gstNumber: '', address: '', city: '', state: '', pincode: '',
    password: '', confirmPassword: '', agreeTerms: false,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async () => {
    const newErrors: Record<string, string> = {};
    if (!formData.pharmacyName) newErrors.pharmacyName = 'Pharmacy name is required';
    if (!formData.ownerName) newErrors.ownerName = 'Owner name is required';
    if (!formData.email) newErrors.email = 'Email is required';
    if (!formData.mobile) newErrors.mobile = 'Mobile is required';
    if (!formData.drugLicense) newErrors.drugLicense = 'Drug license is required';
    if (!formData.gstNumber) newErrors.gstNumber = 'GST number is required';
    if (!formData.address) newErrors.address = 'Address is required';
    if (!formData.password) newErrors.password = 'Password is required';
    if (formData.password !== formData.confirmPassword) newErrors.confirmPassword = 'Passwords do not match';
    if (!formData.agreeTerms) newErrors.agreeTerms = 'You must agree to terms';
    
    setErrors(newErrors);
    if (Object.keys(newErrors).length > 0) return;

    setIsLoading(true);
    setTimeout(() => {
      alert('Registration submitted! Your account is pending approval after document verification.');
      setIsLoading(false);
      router.push('/pharmacy/login');
    }, 1500);
  };

  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <div className="max-w-2xl mx-auto px-4">
        <div className="text-center mb-8">
          <Link href="/" className="text-3xl font-bold text-teal-600">Dawabag</Link>
          <h2 className="mt-4 text-2xl font-bold text-gray-900">Pharmacy Registration</h2>
          <p className="mt-2 text-gray-600">Register your pharmacy for B2B wholesale ordering</p>
        </div>

        <div className="bg-white rounded-lg shadow p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Input label="Pharmacy Name" value={formData.pharmacyName} onChange={(e) => setFormData({...formData, pharmacyName: e.target.value})} error={errors.pharmacyName} />
            <Input label="Owner Name" value={formData.ownerName} onChange={(e) => setFormData({...formData, ownerName: e.target.value})} error={errors.ownerName} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input label="Email" type="email" value={formData.email} onChange={(e) => setFormData({...formData, email: e.target.value})} error={errors.email} />
            <Input label="Mobile" value={formData.mobile} onChange={(e) => setFormData({...formData, mobile: e.target.value})} error={errors.mobile} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input label="Drug License Number" value={formData.drugLicense} onChange={(e) => setFormData({...formData, drugLicense: e.target.value})} error={errors.drugLicense} placeholder="e.g., MH1234567890" />
            <Input label="GST Number" value={formData.gstNumber} onChange={(e) => setFormData({...formData, gstNumber: e.target.value})} error={errors.gstNumber} placeholder="e.g., 29ABCDE1234A1Z5" />
          </div>
          <Input label="Address" value={formData.address} onChange={(e) => setFormData({...formData, address: e.target.value})} error={errors.address} />
          <div className="grid grid-cols-3 gap-4">
            <Input label="City" value={formData.city} onChange={(e) => setFormData({...formData, city: e.target.value})} />
            <Input label="State" value={formData.state} onChange={(e) => setFormData({...formData, state: e.target.value})} />
            <Input label="PIN Code" value={formData.pincode} onChange={(e) => setFormData({...formData, pincode: e.target.value})} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input label="Password" type="password" value={formData.password} onChange={(e) => setFormData({...formData, password: e.target.value})} error={errors.password} />
            <Input label="Confirm Password" type="password" value={formData.confirmPassword} onChange={(e) => setFormData({...formData, confirmPassword: e.target.value})} error={errors.confirmPassword} />
          </div>
          
          <div className="flex items-start">
            <input type="checkbox" id="agreeTerms" checked={formData.agreeTerms} onChange={(e) => setFormData({...formData, agreeTerms: e.target.checked})} className="mt-1" />
            <label htmlFor="agreeTerms" className="ml-2 text-sm text-gray-600">
              I agree to the <a href="#" className="text-teal-600">Terms & Conditions</a> and verify all documents
            </label>
          </div>
          {errors.agreeTerms && <p className="text-red-500 text-sm">{errors.agreeTerms}</p>}

          <Button onClick={handleSubmit} isLoading={isLoading} className="w-full">Submit Registration</Button>
          
          <p className="text-center text-sm text-gray-600">
            Already registered? <Link href="/pharmacy/login" className="font-medium text-teal-600">Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
