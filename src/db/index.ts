// =====================================================
// DAWABAG - Database Connection
// =====================================================

import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import * as schema from './schema';

const sqlite = new Database('dawabag.db');
export const db = drizzle(sqlite, { schema });

// Export tables for easy access
export const users = schema.users;
export const addresses = schema.addresses;
export const patients = schema.patients;
export const medicines = schema.medicines;
export const cartItems = schema.cartItems;
export const orders = schema.orders;
export const orderItems = schema.orderItems;
export const prescriptions = schema.prescriptions;
export const vendors = schema.vendors;
export const purchaseOrders = schema.purchaseOrders;
export const purchaseOrderItems = schema.purchaseOrderItems;
export const coupons = schema.coupons;
export const pincodeServices = schema.pincodeServices;
