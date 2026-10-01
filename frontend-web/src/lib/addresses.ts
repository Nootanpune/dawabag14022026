// Saved delivery addresses — /users/me/addresses. Held only on the server; the
// server also says whether each PIN code is serviceable and how fast.
import api from './api';

export interface Address {
  id: string;
  label: string;
  full_name: string;
  mobile: string;
  address_line1: string;
  address_line2?: string | null;
  city: string;
  state: string;
  pincode: string;
  is_default: boolean;
  is_serviceable?: boolean | null;
  estimated_days?: number | null;
  /** Dawabag's own delivery window for this PIN code, when it delivers there */
  dawabag_delivery_hours?: number | null;
}

export interface AddressInput {
  label: string;
  full_name: string;
  mobile: string;
  address_line1: string;
  address_line2?: string | null;
  city: string;
  state: string;
  pincode: string;
  is_default?: boolean;
}

export const ADDRESSES_QUERY_KEY = ['addresses'] as const;

/** GET /users/me/addresses — default address first. */
export async function fetchAddresses(): Promise<Address[]> {
  const { data } = await api.get('/users/me/addresses');
  return data.data ?? [];
}

export async function createAddress(body: AddressInput): Promise<Address> {
  const { data } = await api.post('/users/me/addresses', body);
  return data.data;
}

/** Editing an address already used by an order returns a NEW row (the order keeps the old one). */
export async function updateAddress(id: string, body: AddressInput): Promise<Address> {
  const { data } = await api.put(`/users/me/addresses/${id}`, body);
  return data.data;
}

export async function deleteAddress(id: string) {
  const { data } = await api.delete(`/users/me/addresses/${id}`);
  return data.data;
}

export async function setDefaultAddress(id: string) {
  const { data } = await api.post(`/users/me/addresses/${id}/default`);
  return data.data;
}

/** Client-side mirror of the server's address rules; returns field → message. */
export function addressErrors(a: AddressInput): Partial<Record<keyof AddressInput, string>> {
  const e: Partial<Record<keyof AddressInput, string>> = {};
  if (!a.label.trim()) e.label = 'Enter a label, e.g. Home';
  if (a.full_name.trim().length < 2) e.full_name = 'Enter the receiver’s name';
  if (!/^[6-9]\d{9}$/.test(a.mobile.trim())) e.mobile = 'Enter a 10-digit Indian mobile number';
  if (a.address_line1.trim().length < 5) e.address_line1 = 'Enter the house / street (at least 5 characters)';
  if (a.city.trim().length < 2) e.city = 'Enter the city';
  if (a.state.trim().length < 2) e.state = 'Enter the state';
  if (!/^\d{6}$/.test(a.pincode.trim())) e.pincode = 'Enter a 6-digit PIN code';
  return e;
}

export function deliveryEstimate(a: Address): string | null {
  if (a.is_serviceable === false) return 'We do not deliver to this PIN code yet';
  if (a.dawabag_delivery_hours) return `Delivery within ${a.dawabag_delivery_hours} hours`;
  if (a.estimated_days) return `Delivery in about ${a.estimated_days} day${a.estimated_days === 1 ? '' : 's'}`;
  return null;
}
