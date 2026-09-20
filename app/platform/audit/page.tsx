import { Suspense } from 'react';
import { PlatformAuditPage } from '@/src/features/platform/audit-page';

export default function Page() { return <Suspense fallback={<p>Loading platform activity…</p>}><PlatformAuditPage /></Suspense>; }
