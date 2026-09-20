import { Suspense } from 'react';
import { MarketplacesPage } from '@/src/features/admin/marketplaces-page';

export default function Page() {
  return <Suspense fallback={<div className="admin-page">Loading marketplace accounts…</div>}><MarketplacesPage /></Suspense>;
}
