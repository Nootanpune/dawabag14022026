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
}

export const ADDRESSES_QUERY_KEY = ['addresses'] as const;

/** GET /users/me/addresses — default address first. */
export async function fetchAddresses(): Promise<Address[]> {
  const { data } = await api.get('/users/me/addresses');
  return data.data ?? [];
}
