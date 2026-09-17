import { MarketingHeader } from '@/src/components/marketing/header';
import { MarketingFooter } from '@/src/components/marketing/footer';
import './marketing.css';

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return <div className="marketing"><a className="skip-link" href="#main-content">Skip to content</a><MarketingHeader /><main id="main-content" tabIndex={-1}>{children}</main><MarketingFooter /></div>;
}
