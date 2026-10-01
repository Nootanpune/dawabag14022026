// What one journey hands to the next: the orders placed and the delivery code.
// Kept in memory for the length of the recording only.
export interface Story {
  orders: { otc?: string; rx?: string; partner?: string };
  deliveryCode?: string;
}

export const newStory = (): Story => ({ orders: {} });
