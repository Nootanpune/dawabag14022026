import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { Providers } from './providers';
import { Toaster } from 'sonner';
import SiteFooter from '@/components/legal/SiteFooter';
import TrialBanner from '@/components/legal/TrialBanner';
import BottomNav from '@/components/layout/BottomNav';

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
          {/* Only on the owner's trial server (APP_ENV=trial): demo data, placeholder licences (C-04) */}
          <TrialBanner />
          {children}
          {/* Licences + grievance officer on every public page, from the server (C-04, C-36) */}
          <SiteFooter />
          <BottomNav />
          {/* At the bottom (above the phone's tab bar), so a toast never covers the header,
              the Back arrow, the cart or a search's suggestions (Sprint 26) */}
          <Toaster
            position="bottom-center"
            richColors
            duration={3000}
            offset={{ bottom: 24 }}
            mobileOffset={{ bottom: 84, left: 16, right: 16 }}
          />
        </Providers>
      </body>
    </html>
  );
}
