import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { Providers } from './providers';
import { Toaster } from 'sonner';
import SiteFooter from '@/components/legal/SiteFooter';
import TrialBanner from '@/components/legal/TrialBanner';
import BottomNav from '@/components/layout/BottomNav';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });

// DAWA BAG brand (owner decision 2026-10-02): icons from public/brand (README there).
// No speed or "best" claims (C-17).
export const metadata: Metadata = {
  title: 'DAWA BAG — Online Pharmacy',
  description: 'Order medicines online from a licensed pharmacy. Every order is checked by a registered pharmacist before it is packed.',
  keywords: 'online pharmacy, medicines, prescription, delivery, Nashik',
  applicationName: 'DAWA BAG',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: '48x48' },
      { url: '/brand/dawabag-mark.svg', type: 'image/svg+xml' },
      { url: '/brand/dawabag-mark-32.png', sizes: '32x32', type: 'image/png' },
    ],
    apple: [{ url: '/brand/apple-touch-icon.png', sizes: '180x180' }],
  },
  openGraph: {
    title: 'DAWA BAG — Online Pharmacy',
    description: 'Your Life Saving Companion. A licensed online pharmacy; every order is checked by a pharmacist.',
    type: 'website',
    images: [{ url: '/brand/dawabag-logo-960.png', width: 960, height: 550, alt: 'DAWA BAG — Your Life Saving Companion' }],
  },
};

export const viewport: Viewport = { themeColor: '#027B87' };

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
