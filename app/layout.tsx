import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import { AppProviders } from '@/src/components/providers/app-providers';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'),
  title: 'Stock Supplies | Profitability workspace',
  description:
    'Multi-marketplace profitability, cost coverage, and operational health for Stock Supplies.',
  openGraph: {
    title: 'Stock Supplies',
    description: 'Marketplace profitability, made visible.',
    type: 'website',
    images: [{ url: '/og.png', width: 1792, height: 937, alt: 'Stock Supplies profitability workspace' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Stock Supplies',
    description: 'Marketplace profitability, made visible.',
    images: ['/og.png'],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
