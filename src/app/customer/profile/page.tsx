// =====================================================
// DAWABAG - Customer Profile Page
// =====================================================

"use client";

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';

interface UserProfile {
  id: string;
  name: string;
  email: string;
  mobile: string;
  firstName: string;
  lastName: string;
  dateOfBirth?: string;
  gender?: string;
  referralCode: string;
  loyaltyPoints: number;
}

export default function ProfilePage() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [activeTab, setActiveTab] = useState('profile');
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    mobile: '',
    dateOfBirth: '',
    gender: '',
  });

  useEffect(() => {
    const savedUser = localStorage.getItem('dawabag_user');
    if (savedUser) {
      const userData = JSON.parse(savedUser);
      setUser(userData);
      setIsLoggedIn(true);
      setFormData({
        firstName: userData.name?.split(' ')[0] || '',
        lastName: userData.name?.split(' ').slice(1).join(' ') || '',
        email: userData.email || '',
        mobile: userData.mobile || '',
        dateOfBirth: userData.dateOfBirth || '',
        gender: userData.gender || '',
      });
    }
  }, []);

  const handleSave = () => {
    if (!user) return;
    
    const updatedUser = {
      ...user,
      name: `${formData.firstName} ${formData.lastName}`,
      email: formData.email,
      mobile: formData.mobile,
      dateOfBirth: formData.dateOfBirth,
      gender: formData.gender,
    };
    
    localStorage.setItem('dawabag_user', JSON.stringify(updatedUser));
    setUser(updatedUser);
    setIsEditing(false);
  };

  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Header />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 text-center">
          <h2 className="text-xl font-medium text-gray-900 mb-4">Please login to view your profile</h2>
          <Link href="/customer/login?redirect=/customer/profile">
            <Button>Login</Button>
          </Link>
        </div>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-8">My Account</h1>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          {/* Sidebar */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-lg shadow-sm p-6">
              <div className="flex items-center mb-6">
                <div className="w-16 h-16 bg-teal-100 rounded-full flex items-center justify-center">
                  <span className="text-2xl font-bold text-teal-600">
                    {user?.name?.charAt(0).toUpperCase() || 'U'}
                  </span>
                </div>
                <div className="ml-4">
                  <p className="font-semibold text-gray-900">{user?.name}</p>
                  <p className="text-sm text-gray-500">{user?.email}</p>
                </div>
              </div>

              <nav className="space-y-2">
                {[
                  { id: 'profile', label: 'Profile', icon: '👤' },
                  { id: 'orders', label: 'My Orders', icon: '📦' },
                  { id: 'addresses', label: 'Addresses', icon: '📍' },
                  { id: 'prescriptions', label: 'Prescriptions', icon: '📋' },
                  { id: 'patients', label: 'Patients', icon: '👨‍⚕️' },
                  { id: 'wishlist', label: 'Wishlist', icon: '❤️' },
                  { id: 'wallet', label: 'Wallet & Points', icon: '💰' },
                ].map((item) => (
                  <button
                    key={item.id}
                    onClick={() => setActiveTab(item.id)}
                    className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg text-left ${
                      activeTab === item.id
                        ? 'bg-teal-50 text-teal-700'
                        : 'text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    <span>{item.icon}</span>
                    <span>{item.label}</span>
                  </button>
                ))}
              </nav>
            </div>
          </div>

          {/* Main Content */}
          <div className="lg:col-span-3">
            {activeTab === 'profile' && (
              <div className="bg-white rounded-lg shadow-sm p-6">
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-lg font-semibold text-gray-900">Profile Information</h2>
                  {!isEditing && (
                    <Button variant="outline" onClick={() => setIsEditing(true)}>
                      Edit Profile
                    </Button>
                  )}
                </div>

                {isEditing ? (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <Input
                        label="First Name"
                        value={formData.firstName}
                        onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                      />
                      <Input
                        label="Last Name"
                        value={formData.lastName}
                        onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                      />
                    </div>
                    <Input
                      label="Email"
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    />
                    <Input
                      label="Mobile"
                      type="tel"
                      value={formData.mobile}
                      onChange={(e) => setFormData({ ...formData, mobile: e.target.value })}
                    />
                    <Input
                      label="Date of Birth"
                      type="date"
                      value={formData.dateOfBirth}
                      onChange={(e) => setFormData({ ...formData, dateOfBirth: e.target.value })}
                    />
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Gender</label>
                      <select
                        value={formData.gender}
                        onChange={(e) => setFormData({ ...formData, gender: e.target.value })}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                      >
                        <option value="">Select gender</option>
                        <option value="male">Male</option>
                        <option value="female">Female</option>
                        <option value="other">Other</option>
                      </select>
                    </div>
                    <div className="flex space-x-4">
                      <Button onClick={handleSave}>Save Changes</Button>
                      <Button variant="outline" onClick={() => setIsEditing(false)}>Cancel</Button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-sm text-gray-500">First Name</p>
                        <p className="font-medium">{formData.firstName || 'Not set'}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-500">Last Name</p>
                        <p className="font-medium">{formData.lastName || 'Not set'}</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-sm text-gray-500">Email</p>
                        <p className="font-medium">{user?.email}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-500">Mobile</p>
                        <p className="font-medium">{user?.mobile || 'Not set'}</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-sm text-gray-500">Referral Code</p>
                        <p className="font-medium text-teal-600">{user?.referralCode || 'Not available'}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-500">Loyalty Points</p>
                        <p className="font-medium">{user?.loyaltyPoints || 0} points</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'orders' && (
              <div className="bg-white rounded-lg shadow-sm p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">My Orders</h2>
                <Link href="/customer/orders" className="text-teal-600 hover:text-teal-700">
                  View all orders →
                </Link>
              </div>
            )}

            {activeTab === 'addresses' && (
              <div className="bg-white rounded-lg shadow-sm p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Saved Addresses</h2>
                <p className="text-gray-500">No addresses saved yet.</p>
                <Button variant="outline" className="mt-4">Add New Address</Button>
              </div>
            )}

            {activeTab === 'prescriptions' && (
              <div className="bg-white rounded-lg shadow-sm p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">My Prescriptions</h2>
                <p className="text-gray-500">No prescriptions uploaded yet.</p>
                <Button variant="outline" className="mt-4">Upload Prescription</Button>
              </div>
            )}

            {activeTab === 'patients' && (
              <div className="bg-white rounded-lg shadow-sm p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">My Patients</h2>
                <p className="text-gray-500">No patients added yet.</p>
                <Button variant="outline" className="mt-4">Add Patient</Button>
              </div>
            )}

            {activeTab === 'wishlist' && (
              <div className="bg-white rounded-lg shadow-sm p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">My Wishlist</h2>
                <p className="text-gray-500">Your wishlist is empty.</p>
              </div>
            )}

            {activeTab === 'wallet' && (
              <div className="bg-white rounded-lg shadow-sm p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Wallet & Points</h2>
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-teal-50 rounded-lg p-4">
                    <p className="text-sm text-teal-600">Wallet Balance</p>
                    <p className="text-2xl font-bold text-teal-700">₹0</p>
                  </div>
                  <div className="bg-orange-50 rounded-lg p-4">
                    <p className="text-sm text-orange-600">Loyalty Points</p>
                    <p className="text-2xl font-bold text-orange-700">{user?.loyaltyPoints || 0}</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <Footer />
    </div>
  );
}
