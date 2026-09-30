import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { Providers } from './providers';
import { Toaster } from 'sonner';
import SiteFooter from '@/components/legal/SiteFooter';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });

export const metadata: Metadata = {
  title: 'Dawabag — Online Pharmacy',
  description: 'Order medicines online with prescription verification, fast delivery, and expert pharmacist support.',
  keywords: 'online pharmacy, medicines, prescription, delivery, Nashik',
  openGraph: {
    title: 'Dawabag — Online Pharmacy',
    description: 'Trusted online pharmacy with doorstep delivery',
    type: 'website',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.variable} font-sans antialiased bg-gray-50`}>
        <Providers>
          {children}
          {/* Licences + grievance officer on every page, from the server (C-04, C-36) */}
          <SiteFooter />
          <Toaster position="top-right" richColors />
        </Providers>
      </body>
    </html>
  );
}
