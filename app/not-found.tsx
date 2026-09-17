import { MarketingHeader } from '@/src/components/marketing/header';
import { MarketingFooter } from '@/src/components/marketing/footer';
import { MarketingCTA } from '@/src/components/marketing/cta';
import './(marketing)/marketing.css';

export default function NotFound() {
  return <div className="marketing"><a className="skip-link" href="#main-content">Skip to content</a><MarketingHeader /><main id="main-content" className="m-not-found" tabIndex={-1}><div className="m-container"><span className="m-error-number" aria-hidden="true">404</span><p className="m-eyebrow">Page not found</p><h1>This page doesn’t add up.</h1><p>The link may have changed, or the page may no longer exist. Let’s get you back to a clearer picture.</p><div className="m-actions"><MarketingCTA id="404-home" href="/">Return home</MarketingCTA><MarketingCTA id="404-product" href="/marketplace-profitability" variant="secondary">Explore Module 01</MarketingCTA></div></div></main><MarketingFooter /></div>;
}
