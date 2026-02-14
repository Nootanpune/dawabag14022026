// =====================================================
// DAWABAG - Doctor Portal
// Addressing URS Doctor Gaps
// =====================================================

"use client";

import { useState } from 'react';
import Link from 'next/link';
import { 
  Doctor, 
  DoctorPatient, 
  ReferralRedemption,
  VerificationStatus,
  Medicine
} from '@/types';

// Sample data
const sampleDoctor: Doctor = {
  id: 'doc_001',
  email: 'dr.sharma@example.com',
  mobile: '9876543210',
  password: '',
  firstName: 'Rajesh',
  lastName: 'Sharma',
  registrationNumber: 'MH-12345-2020',
  clinicName: 'Sharma Medical Clinic',
  specialty: 'General Medicine',
  qualification: 'MBBS, MD',
  experience: 15,
  clinicAddress: '123, Health Street, Andheri East',
  city: 'Mumbai',
  state: 'Maharashtra',
  pincode: '400069',
  licenseDocument: '/docs/license.pdf',
  isVerified: true,
  verificationStatus: VerificationStatus.APPROVED,
  referralCode: 'DRSHARMA10',
  bonusPoints: 2500,
  pointsRedeemed: 500,
  referralEarnings: 15000,
  isActive: true,
  isAvailableForConsultation: true,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-02-14T00:00:00Z',
  patients: [],
  redemptions: [],
};

const sampleRedemptions: ReferralRedemption[] = [
  {
    id: 'red_001',
    doctorId: 'doc_001',
    customerId: 'cust_001',
    orderId: 'ord_001',
    pointsEarned: 100,
    discountAvailed: 200,
    redeemedAt: '2026-02-10T10:00:00Z',
  },
  {
    id: 'red_002',
    doctorId: 'doc_001',
    customerId: 'cust_002',
    orderId: 'ord_002',
    pointsEarned: 150,
    discountAvailed: 300,
    redeemedAt: '2026-02-12T14:30:00Z',
  },
  {
    id: 'red_003',
    doctorId: 'doc_001',
    customerId: 'cust_003',
    orderId: 'ord_003',
    pointsEarned: 100,
    discountAvailed: 200,
    redeemedAt: '2026-02-13T09:15:00Z',
  },
];

const samplePatients: DoctorPatient[] = [
  {
    id: 'docpat_001',
    doctorId: 'doc_001',
    customerId: 'cust_001',
    patientName: 'John Doe',
    mobile: '9876543211',
    notes: 'Regular patient for BP medicines',
    createdAt: '2026-01-15T00:00:00Z',
  },
  {
    id: 'docpat_002',
    doctorId: 'doc_001',
    customerId: 'cust_002',
    patientName: 'Jane Smith',
    mobile: '9876543212',
    notes: 'Diabetic patient',
    createdAt: '2026-01-20T00:00:00Z',
  },
];

const sampleDoctorMedicines: Medicine[] = [
  {
    id: 'med_001',
    sku: 'DOC-SKU001',
    name: 'Metformin 500mg (B2B)',
    genericName: 'Metformin Hydrochloride',
    brandName: 'Glycomet',
    saltComposition: 'Metformin 500mg',
    manufacturer: 'USV Ltd',
    description: 'Anti-diabetic medication - Doctor Pricing',
    usage: 'Take with food',
    storageInstructions: 'Store in cool, dry place',
    category: 'Diabetes',
    dosageForm: 'tablet',
    strength: '500mg',
    packSize: 100,
    unit: 'tablets',
    mrp: 150,
    offerPrice: 95,
    discount: 37,
    stock: 5000,
    minStockLevel: 1000,
    reorderLevel: 500,
    requiresPrescription: true,
    isScheduledDrug: false,
    images: [],
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'med_002',
    sku: 'DOC-SKU002',
    name: 'Amlodipine 5mg (B2B)',
    genericName: 'Amlodipine Besylate',
    brandName: 'Amlovas',
    saltComposition: 'Amlodipine 5mg',
    manufacturer: 'Macleods',
    description: 'Blood pressure medication - Doctor Pricing',
    usage: 'Take once daily',
    storageInstructions: 'Store below 30°C',
    category: 'Cardiology',
    dosageForm: 'tablet',
    strength: '5mg',
    packSize: 100,
    unit: 'tablets',
    mrp: 120,
    offerPrice: 75,
    discount: 38,
    stock: 3000,
    minStockLevel: 800,
    reorderLevel: 400,
    requiresPrescription: true,
    isScheduledDrug: false,
    images: [],
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

type DoctorTab = 'dashboard' | 'patients' | 'referrals' | 'catalog' | 'prescriptions' | 'settings';

export default function DoctorDashboard() {
  const [activeTab, setActiveTab] = useState<DoctorTab>('dashboard');
  const [isLoggedIn, setIsLoggedIn] = useState(true);
  const [referralCode] = useState(sampleDoctor.referralCode);
  const [copied, setCopied] = useState(false);

  const handleCopyCode = () => {
    navigator.clipboard.writeText(referralCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleShareCode = (platform: string) => {
    const message = `Use my referral code ${referralCode} on Dawabag to get 15% off on your first order!`;
    if (platform === 'whatsapp') {
      window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank');
    } else if (platform === 'email') {
      window.open(`mailto:?subject=Get discount on Dawabag&body=${encodeURIComponent(message)}`, '_blank');
    }
  };

  const tabs: { id: DoctorTab; label: string; icon: JSX.Element }[] = [
    {
      id: 'dashboard',
      label: 'Dashboard',
      icon: (
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
        </svg>
      ),
    },
    {
      id: 'patients',
      label: 'My Patients',
      icon: (
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
      ),
    },
    {
      id: 'referrals',
      label: 'Referrals',
      icon: (
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14" />
        </svg>
      ),
    },
    {
      id: 'catalog',
      label: 'Doctor Catalog',
      icon: (
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
        </svg>
      ),
    },
    {
      id: 'prescriptions',
      label: 'Prescriptions',
      icon: (
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      ),
    },
    {
      id: 'settings',
      label: 'Settings',
      icon: (
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      ),
    },
  ];

  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-xl shadow-lg p-8">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-teal-600">Dawabag</h1>
            <p className="text-gray-500 mt-2">Doctor Portal</p>
          </div>
          
          <h2 className="text-xl font-semibold text-center mb-6">Doctor Login / Signup</h2>
          
          <form className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Registration Number</label>
              <input
                type="text"
                placeholder="e.g., MH-12345-2020"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500"
                required
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Mobile Number</label>
              <input
                type="tel"
                placeholder="10-digit mobile number"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500"
                required
              />
            </div>
            
            <button
              type="submit"
              className="w-full py-3 bg-teal-600 text-white font-medium rounded-lg hover:bg-teal-700"
            >
              Send OTP
            </button>
          </form>
          
          <div className="mt-6 pt-6 border-t text-center">
            <p className="text-sm text-gray-500">
              For verification, submit your medical registration ID, clinic details, and KYC documents
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center">
              <Link href="/" className="text-2xl font-bold text-teal-600">Dawabag</Link>
              <span className="ml-2 px-2 py-1 text-xs font-medium bg-blue-100 text-blue-800 rounded">Doctor</span>
            </div>
            <div className="flex items-center space-x-4">
              <button className="p-2 text-gray-500 hover:text-gray-700">
                <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
              </button>
              <div className="flex items-center">
                <span className="text-sm font-medium text-gray-700">Dr. {sampleDoctor.firstName} {sampleDoctor.lastName}</span>
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col lg:flex-row gap-8">
          {/* Sidebar */}
          <aside className="w-full lg:w-64">
            <nav className="bg-white rounded-lg shadow-sm p-4 space-y-1">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`w-full flex items-center px-4 py-3 text-sm font-medium rounded-lg ${
                    activeTab === tab.id
                      ? 'bg-blue-50 text-blue-700'
                      : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                  }`}
                >
                  {tab.icon}
                  <span className="ml-3">{tab.label}</span>
                </button>
              ))}
            </nav>
          </aside>

          {/* Main Content */}
          <main className="flex-1">
            {/* Dashboard Tab */}
            {activeTab === 'dashboard' && (
              <div className="space-y-6">
                {/* Stats Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                  <div className="bg-white rounded-lg shadow-sm p-6">
                    <p className="text-sm font-medium text-gray-500">Total Patients</p>
                    <p className="text-2xl font-bold text-gray-900">{samplePatients.length}</p>
                  </div>
                  <div className="bg-white rounded-lg shadow-sm p-6">
                    <p className="text-sm font-medium text-gray-500">Referral Redemptions</p>
                    <p className="text-2xl font-bold text-gray-900">{sampleRedemptions.length}</p>
                  </div>
                  <div className="bg-white rounded-lg shadow-sm p-6">
                    <p className="text-sm font-medium text-gray-500">Bonus Points</p>
                    <p className="text-2xl font-bold text-blue-600">{sampleDoctor.bonusPoints}</p>
                    <p className="text-xs text-gray-500">Worth ₹{sampleDoctor.bonusPoints * 2}</p>
                  </div>
                  <div className="bg-white rounded-lg shadow-sm p-6">
                    <p className="text-sm font-medium text-gray-500">Total Earnings</p>
                    <p className="text-2xl font-bold text-green-600">₹{sampleDoctor.referralEarnings}</p>
                  </div>
                </div>

                {/* Referral Code Card */}
                <div className="bg-gradient-to-r from-blue-500 to-blue-700 rounded-xl p-6 text-white">
                  <h3 className="text-lg font-semibold mb-4">Your Referral Code</h3>
                  <div className="flex items-center justify-between bg-white/10 rounded-lg p-4 mb-4">
                    <span className="text-2xl font-bold tracking-wider">{referralCode}</span>
                    <button
                      onClick={handleCopyCode}
                      className="px-4 py-2 bg-white text-blue-600 rounded-lg text-sm font-medium hover:bg-blue-50"
                    >
                      {copied ? 'Copied!' : 'Copy'}
                    </button>
                  </div>
                  <p className="text-sm text-blue-100 mb-4">Share this code with your patients to help them save 15% on their first order</p>
                  <div className="flex space-x-3">
                    <button
                      onClick={() => handleShareCode('whatsapp')}
                      className="flex-1 py-2 bg-green-500 rounded-lg text-sm font-medium hover:bg-green-600 flex items-center justify-center"
                    >
                      <svg className="h-5 w-5 mr-2" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                      </svg>
                      WhatsApp
                    </button>
                    <button
                      onClick={() => handleShareCode('email')}
                      className="flex-1 py-2 bg-gray-200 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-300 flex items-center justify-center"
                    >
                      <svg className="h-5 w-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                      </svg>
                      Email
                    </button>
                  </div>
                </div>

                {/* Recent Redemptions */}
                <div className="bg-white rounded-lg shadow-sm">
                  <div className="px-6 py-4 border-b">
                    <h3 className="text-lg font-semibold">Recent Redemptions</h3>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Patient</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Order ID</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Points Earned</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {sampleRedemptions.map((redemption) => (
                          <tr key={redemption.id} className="hover:bg-gray-50">
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                              {redemption.customerId}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-teal-600">
                              {redemption.orderId}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-blue-600">
                              +{redemption.pointsEarned} pts
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                              {new Date(redemption.redeemedAt).toLocaleDateString()}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* Patients Tab */}
            {activeTab === 'patients' && (
              <div className="bg-white rounded-lg shadow-sm">
                <div className="px-6 py-4 border-b flex items-center justify-between">
                  <h3 className="text-lg font-semibold">My Patients</h3>
                  <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                    Add Patient
                  </button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Patient Name</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Mobile</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Notes</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {samplePatients.map((patient) => (
                        <tr key={patient.id} className="hover:bg-gray-50">
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                            {patient.patientName}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {patient.mobile}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {patient.notes || '-'}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm">
                            <button className="text-blue-600 hover:text-blue-700 mr-3">View History</button>
                            <button className="text-blue-600 hover:text-blue-700">Add Note</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Referrals Tab */}
            {activeTab === 'referrals' && (
              <div className="space-y-6">
                <div className="bg-white rounded-lg shadow-sm p-6">
                  <h3 className="text-lg font-semibold mb-4">Referral Statistics</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="p-4 bg-blue-50 rounded-lg">
                      <p className="text-sm text-blue-600 font-medium">Total Redemptions</p>
                      <p className="text-2xl font-bold text-blue-900">{sampleRedemptions.length}</p>
                    </div>
                    <div className="p-4 bg-green-50 rounded-lg">
                      <p className="text-sm text-green-600 font-medium">Total Points Earned</p>
                      <p className="text-2xl font-bold text-green-900">
                        {sampleRedemptions.reduce((sum, r) => sum + r.pointsEarned, 0)}
                      </p>
                    </div>
                    <div className="p-4 bg-purple-50 rounded-lg">
                      <p className="text-sm text-purple-600 font-medium">Total Discount Given</p>
                      <p className="text-2xl font-bold text-purple-900">
                        ₹{sampleRedemptions.reduce((sum, r) => sum + r.discountAvailed, 0)}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-lg shadow-sm p-6">
                  <h3 className="text-lg font-semibold mb-4">Points Redemption</h3>
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
                    <p className="text-sm text-yellow-800">
                      <strong>Note:</strong> Points must be redeemed within 12 months of earning. Unredeemed points will expire.
                    </p>
                  </div>
                  <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                    <div>
                      <p className="text-sm text-gray-500">Available Points</p>
                      <p className="text-2xl font-bold text-gray-900">{sampleDoctor.bonusPoints}</p>
                    </div>
                    <button className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                      Redeem Points
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Catalog Tab - Different from Customer */}
            {activeTab === 'catalog' && (
              <div className="space-y-6">
                <div className="bg-white rounded-lg shadow-sm p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="text-lg font-semibold">Doctor & Distributor Catalog</h3>
                      <p className="text-sm text-gray-500">Special pricing for doctors and pharmacies</p>
                    </div>
                    <span className="px-3 py-1 bg-purple-100 text-purple-800 text-sm font-medium rounded">
                      B2B Pricing
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {sampleDoctorMedicines.map((medicine) => (
                    <div key={medicine.id} className="bg-white rounded-lg shadow-sm p-6">
                      <div className="flex justify-between items-start mb-4">
                        <div>
                          <h4 className="font-semibold text-gray-900">{medicine.name}</h4>
                          <p className="text-sm text-gray-500">{medicine.genericName}</p>
                        </div>
                        <span className="px-2 py-1 text-xs font-medium bg-green-100 text-green-800 rounded">
                          {medicine.discount}% off
                        </span>
                      </div>
                      <div className="flex items-baseline space-x-2 mb-4">
                        <span className="text-2xl font-bold text-purple-600">₹{medicine.offerPrice}</span>
                        <span className="text-sm text-gray-400 line-through">₹{medicine.mrp}</span>
                      </div>
                      <p className="text-sm text-gray-500 mb-4">
                        Pack Size: {medicine.packSize} {medicine.unit} | Stock: {medicine.stock.toLocaleString()}
                      </p>
                      <button className="w-full py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700">
                        Add to Order
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Prescriptions Tab */}
            {activeTab === 'prescriptions' && (
              <div className="bg-white rounded-lg shadow-sm p-6">
                <h3 className="text-lg font-semibold mb-4">E-Prescription (Coming Soon)</h3>
                <div className="text-center py-8">
                  <svg className="mx-auto h-16 w-16 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <p className="mt-4 text-gray-500">Generate digital prescriptions for your patients</p>
                  <p className="text-sm text-gray-400 mt-2">Coming in future update</p>
                </div>
              </div>
            )}

            {/* Settings Tab */}
            {activeTab === 'settings' && (
              <div className="bg-white rounded-lg shadow-sm p-6">
                <h3 className="text-lg font-semibold mb-6">Profile Settings</h3>
                <div className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
                      <input
                        type="text"
                        defaultValue={`Dr. ${sampleDoctor.firstName} ${sampleDoctor.lastName}`}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Registration Number</label>
                      <input
                        type="text"
                        defaultValue={sampleDoctor.registrationNumber}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                        disabled
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Specialty</label>
                      <input
                        type="text"
                        defaultValue={sampleDoctor.specialty}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Clinic Name</label>
                      <input
                        type="text"
                        defaultValue={sampleDoctor.clinicName}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Mobile</label>
                      <input
                        type="tel"
                        defaultValue={sampleDoctor.mobile}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                      <input
                        type="email"
                        defaultValue={sampleDoctor.email}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                      />
                    </div>
                  </div>
                  
                  <div className="pt-4">
                    <button className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                      Save Changes
                    </button>
                  </div>
                </div>
              </div>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}
