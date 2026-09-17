import type { Metadata } from 'next';
import { RuntimeBoundary } from '@/src/components/marketing/runtime-boundary';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'),
  title: 'Stock Supplies | Profitability workspace',
  description:
    'Multi-marketplace profitability, cost coverage, and operational health for Stock Supplies.',
  icons: { icon: '/favicon.svg' },
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
      <body>
        <RuntimeBoundary>{children}</RuntimeBoundary>
      </body>
    </html>
  );
}
