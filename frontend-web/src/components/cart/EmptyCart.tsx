import Link from 'next/link';
import { ShoppingBag } from 'lucide-react';

export default function EmptyCart({ signedIn }: { signedIn: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 px-4 text-center">
      <ShoppingBag className="w-16 h-16 text-gray-300 mb-4" />
      <h2 className="text-xl font-semibold text-gray-600 mb-2">
        {signedIn ? 'Your cart is empty' : 'Sign in to see your cart'}
      </h2>
      <p className="text-sm text-gray-400 mb-6">
        {signedIn ? 'Browse medicines and add them to your cart' : 'Your cart is saved to your Dawabag account'}
      </p>
      <Link href={signedIn ? '/' : '/auth/login'} className="btn-primary">
        {signedIn ? 'Browse medicines' : 'Sign in'}
      </Link>
    </div>
  );
}
