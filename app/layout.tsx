import type { Metadata } from 'next';
import { RuntimeBoundary } from '@/src/components/marketing/runtime-boundary';
import './globals.css';
import './theme.css';
import '@/src/features/account/account.css';

const appearanceScript = `(function(){try{var r=document.documentElement,p=location.pathname,a=/^\\/(account|auth|onboarding|o|platform)(\\/|$)/.test(p);if(!a){r.style.colorScheme='light';return}var t=localStorage.getItem('stock-supplies:appearance')||'system',d=t==='dark'||(t==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);r.dataset.appearance=t;r.dataset.theme=d?'dark':'light';r.style.colorScheme=d?'dark':'light'}catch(_){}})();`;

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
    <html lang="en" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: appearanceScript }} /></head>
      <body>
        <RuntimeBoundary>{children}</RuntimeBoundary>
      </body>
    </html>
  );
}
