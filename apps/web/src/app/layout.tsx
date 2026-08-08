import type { Metadata, Viewport } from 'next';
import Script from 'next/script';
import { env } from '@/lib/env';
import { ThemeScript } from '@/components/theme-script';
import { ToastProvider } from '@/components/ui/toast';
import './globals.css';

const SITE = env.NEXT_PUBLIC_SITE_URL;

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  applicationName: 'EVRute',
  title: {
    default: 'EVRute — Find and use EV charging across India',
    template: '%s · EVRute',
  },
  description:
    'Find nearby EV charging stations, check live connector availability, start a charge from your phone and pay from one wallet. Live across India.',
  keywords: [
    'EV charging India', 'electric vehicle charging station', 'CCS2 charger',
    'Type 2 charger', 'EV charging near me', 'car charging app',
  ],
  authors: [{ name: 'EVRute' }],
  manifest: '/manifest.webmanifest',
  alternates: { canonical: SITE },
  openGraph: {
    type: 'website',
    siteName: 'EVRute',
    locale: 'en_IN',
    url: SITE,
    title: 'EVRute — Find and use EV charging across India',
    description:
      'Live connector availability, one-tap charging and a single wallet for every station.',
    images: [{ url: '/og.png', width: 1200, height: 630, alt: 'EVRute charging network' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'EVRute — EV charging across India',
    description: 'Live availability, one-tap charging, one wallet.',
    images: ['/og.png'],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'EVRute',
  },
  formatDetection: { telephone: false },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, 'max-image-preview': 'large', 'max-snippet': -1 },
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Never lock zoom: pinch-to-zoom is an accessibility requirement
  // (WCAG 1.4.4), not a layout inconvenience.
  maximumScale: 5,
  userScalable: true,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0b0f14' },
  ],
};

const organizationJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: 'EVRute',
  url: SITE,
  logo: `${SITE}/icons/icon-512.png`,
  description: 'EV charging network aggregator operating across India.',
  areaServed: { '@type': 'Country', name: 'India' },
};

const webAppJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'WebApplication',
  name: 'EVRute',
  url: SITE,
  applicationCategory: 'TravelApplication',
  operatingSystem: 'Any',
  offers: { '@type': 'Offer', price: '0', priceCurrency: 'INR' },
};

export default function RootLayout({ children }: { readonly children: React.ReactNode }) {
  return (
    <html lang="en-IN" suppressHydrationWarning>
      <head>
        <ThemeScript />
        <link rel="apple-touch-icon" href="/icons/icon-192.png" />
        <link rel="icon" href="/icons/icon.svg" type="image/svg+xml" />
      </head>
      <body className="min-h-dvh antialiased">
        <a href="#main" className="skip-link">
          Skip to main content
        </a>
        <ToastProvider>
          <div id="main" className="min-h-dvh">
            {children}
          </div>
        </ToastProvider>

        <Script
          id="ld-organization"
          type="application/ld+json"
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd) }}
        />
        <Script
          id="ld-webapp"
          type="application/ld+json"
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(webAppJsonLd) }}
        />
      </body>
    </html>
  );
}
