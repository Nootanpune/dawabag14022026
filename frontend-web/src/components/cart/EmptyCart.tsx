import { ShoppingBag, LogIn } from 'lucide-react';
import EmptyState from '@/components/ui/EmptyState';

export default function EmptyCart({ signedIn }: { signedIn: boolean }) {
  return signedIn ? (
    <EmptyState
      icon={ShoppingBag}
      as="h1"
      title="Your cart is empty"
      hint="Search for a medicine by brand or generic name and add it here. Have a prescription? You upload it at checkout."
      action={{ label: 'Browse medicines', href: '/' }}
    />
  ) : (
    <EmptyState
      icon={LogIn}
      as="h1"
      title="Sign in to see your cart"
      hint="Your cart is kept in your Dawabag account, so it is the same on every device."
      action={{ label: 'Sign in', href: '/auth/login' }}
    />
  );
}
