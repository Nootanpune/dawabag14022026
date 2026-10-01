// Shiprocket API client. The login token (valid ~10 days) is cached in memory
// only. SHIPROCKET_BASE_URL lets tests point at a throwaway fake server.
import { AppError } from '../../utils/AppError';

let session: { token: string; exp: number } | null = null;
const base = () => process.env.SHIPROCKET_BASE_URL || 'https://apiv2.shiprocket.in';

export const shiprocketConfigured = () => !!(process.env.SHIPROCKET_EMAIL && process.env.SHIPROCKET_PASSWORD);

async function token(): Promise<string> {
  if (session && session.exp > Date.now()) return session.token;
  if (!shiprocketConfigured()) throw new AppError('Shiprocket is not configured', 503);
  const res = await fetch(`${base()}/v1/external/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: process.env.SHIPROCKET_EMAIL, password: process.env.SHIPROCKET_PASSWORD }),
  });
  const b: any = await res.json().catch(() => ({}));
  if (!res.ok || !b.token) throw new AppError(`Shiprocket login failed: ${b.message || res.status}`, 502);
  session = { token: b.token, exp: Date.now() + 9 * 864e5 };
  return session.token;
}

async function call(path: string, body: unknown): Promise<any> {
  const res = await fetch(`${base()}${path}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await token()}` }, body: JSON.stringify(body),
  });
  const b: any = await res.json().catch(() => ({}));
  if (res.status === 401) session = null;
  if (!res.ok) throw new AppError(`Shiprocket: ${b.message || res.statusText}`, 502);
  return b;
}

export interface CourierOrder {
  order_id: string; order_date: string; pickup_location: string;
  name: string; address: string; city: string; pincode: string; state: string; phone: string; email?: string | null;
  sub_total: number; weight_kg: number;
}

// Creates the courier order and assigns an AWB. Only what delivery needs is shared:
// the parcel is "Pharmacy items" — medicine names never go to the courier (C-41).
export async function createShipment(o: CourierOrder): Promise<{ orderRef: string; shipmentRef: string; awb: string; courier: string }> {
  const created = await call('/v1/external/orders/create/adhoc', {
    order_id: o.order_id, order_date: o.order_date, pickup_location: o.pickup_location,
    billing_customer_name: o.name, billing_last_name: '', billing_address: o.address, billing_city: o.city,
    billing_pincode: o.pincode, billing_state: o.state, billing_country: 'India', billing_email: o.email || 'orders@dawabag.in',
    billing_phone: o.phone, shipping_is_billing: true,
    order_items: [{ name: 'Pharmacy items', sku: o.order_id, units: 1, selling_price: o.sub_total }],
    payment_method: 'Prepaid', sub_total: o.sub_total, length: 20, breadth: 15, height: 10, weight: o.weight_kg,
  });
  if (!created.shipment_id) throw new AppError(`Shiprocket did not create the shipment: ${created.message || 'no shipment id'}`, 502);
  const awb = await call('/v1/external/courier/assign/awb', { shipment_id: created.shipment_id });
  const data = awb?.response?.data;
  if (!data?.awb_code) throw new AppError(`Shiprocket could not assign an AWB: ${awb.message || 'no courier available'}`, 502);
  return { orderRef: String(created.order_id), shipmentRef: String(created.shipment_id), awb: String(data.awb_code), courier: String(data.courier_name || 'Shiprocket') };
}

export function resetShiprocketSession() { session = null; }
