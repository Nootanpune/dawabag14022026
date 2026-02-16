// =====================================================
// DAWABAG - Doctor Signup Page
// =====================================================

"use client";

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';

export default function DoctorSignupPage() {
  const router = useRouter();
  const [formData, setFormData] = useState({
    firstName: '', lastName: '', email: '', mobile: '',
    registrationNumber: '', clinicName: '', specialty: '', city: '', state: '',
    password: '', confirmPassword: '', agreeTerms: false,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [step, setStep] = useState(1);

  const specialties = [
    'General Physician', 'Cardiologist', 'Dermatologist', 'Pediatrician',
    'Orthopedic', 'Gynecologist', 'Neurologist', 'Psychiatrist',
    'Gastroenterologist', 'Pulmonologist', 'Endocrinologist', 'Other',
  ];

  const handleSubmit = async () => {
    const newErrors: Record<string, string> = {};
    if (!formData.firstName) newErrors.firstName = 'First name is required';
    if (!formData.lastName) newErrors.lastName = 'Last name is required';
    if (!formData.email) newErrors.email = 'Email is required';
    if (!formData.mobile) newErrors.mobile = 'Mobile is required';
    if (!formData.registrationNumber) newErrors.registrationNumber = 'Registration number is required';
    if (!formData.clinicName) newErrors.clinicName = 'Clinic name is required';
    if (!formData.specialty) newErrors.specialty = 'Specialty is required';
    if (!formData.password) newErrors.password = 'Password is required';
    if (formData.password !== formData.confirmPassword) newErrors.confirmPassword = 'Passwords do not match';
    if (!formData.agreeTerms) newErrors.agreeTerms = 'You must agree to terms';
    
    setErrors(newErrors);
    if (Object.keys(newErrors).length > 0) return;

    setIsLoading(true);
    setTimeout(() => {
      const doctor = {
        id: 'doc_' + Date.now(),
        name: `${formData.firstName} ${formData.lastName}`,
        email: formData.email,
        specialty: formData.specialty,
        referralCode: 'DR' + formData.registrationNumber.slice(-6).toUpperCase(),
      };
      localStorage.setItem('dawabag_doctor', JSON.stringify(doctor));
      setIsLoading(false);
      alert('Registration submitted! Your account is pending approval.');
      router.push('/doctor/login');
    }, 1500);
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-2xl">
        <div className="text-center">
          <Link href="/" className="text-3xl font-bold text-teal-600">Dawabag</Link>
          <h2 className="mt-6 text-center text-2xl font-bold text-gray-900">Doctor Registration</h2>
          <p className="mt-2 text-center text-sm text-gray-600">Join our network and earn bonus points on patient referrals</p>
        </div>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-2xl">
        <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
          {/* Progress */}
          <div className="mb-6 flex justify-center gap-2">
            {[1, 2].map((s) => (
              <div key={s} className={`w-8 h-8 rounded-full flex items-center justify-center ${step >= s ? 'bg-teal-600 text-white' : 'bg-gray-200'}`}>
                {s}
              </div>
            ))}
          </div>

          {step === 1 ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <Input label="First Name" value={formData.firstName} onChange={(e) => setFormData({...formData, firstName: e.target.value})} error={errors.firstName} />
                <Input label="Last Name" value={formData.lastName} onChange={(e) => setFormData({...formData, lastName: e.target.value})} error={errors.lastName} />
              </div>
              <Input label="Email" type="email" value={formData.email} onChange={(e) => setFormData({...formData, email: e.target.value})} error={errors.email} />
              <Input label="Mobile" type="tel" value={formData.mobile} onChange={(e) => setFormData({...formData, mobile: e.target.value.replace(/\D/g, '').slice(0,10)})} error={errors.mobile} />
              <div className="grid grid-cols-2 gap-4">
                <Input label="Registration Number" value={formData.registrationNumber} onChange={(e) => setFormData({...formData, registrationNumber: e.target.value})} error={errors.registrationNumber} placeholder="e.g., MH12345" />
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Specialty <span className="text-red-500">*</span></label>
                  <select value={formData.specialty} onChange={(e) => setFormData({...formData, specialty: e.target.value})} className="w-full px-4 py-2 border rounded-lg">
                    <option value="">Select Specialty</option>
                    {specialties.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                  {errors.specialty && <p className="text-red-500 text-sm mt-1">{errors.specialty}</p>}
                </div>
              </div>
              <Input label="Clinic Name" value={formData.clinicName} onChange={(e) => setFormData({...formData, clinicName: e.target.value})} error={errors.clinicName} />
              <div className="grid grid-cols-2 gap-4">
                <Input label="City" value={formData.city} onChange={(e) => setFormData({...formData, city: e.target.value})} />
                <Input label="State" value={formData.state} onChange={(e) => setFormData({...formData, state: e.target.value})} />
              </div>
              <Button onClick={() => setStep(2)} className="w-full">Continue</Button>
            </div>
          ) : (
            <div className="space-y-4">
              <Input label="Password" type="password" value={formData.password} onChange={(e) => setFormData({...formData, password: e.target.value})} error={errors.password} />
              <Input label="Confirm Password" type="password" value={formData.confirmPassword} onChange={(e) => setFormData({...formData, confirmPassword: e.target.value})} error={errors.confirmPassword} />
              
              <div className="flex items-start">
                <input type="checkbox" id="agreeTerms" checked={formData.agreeTerms} onChange={(e) => setFormData({...formData, agreeTerms: e.target.checked})} className="mt-1" />
                <label htmlFor="agreeTerms" className="ml-2 text-sm text-gray-600">
                  I agree to the <a href="#" className="text-teal-600">Terms & Conditions</a> and <a href="#" className="text-teal-600">Privacy Policy</a>
                </label>
              </div>
              {errors.agreeTerms && <p className="text-red-500 text-sm">{errors.agreeTerms}</p>}

              <div className="flex gap-4">
                <Button variant="outline" onClick={() => setStep(1)} className="flex-1">Back</Button>
                <Button onClick={handleSubmit} isLoading={isLoading} className="flex-1">Submit Registration</Button>
              </div>
            </div>
          )}

          <div className="mt-6 text-center">
            <p className="text-sm text-gray-600">Already registered? <Link href="/doctor/login" className="font-medium text-teal-600">Sign in</Link></p>
          </div>
        </div>
      </div>
    </div>
  );
}
