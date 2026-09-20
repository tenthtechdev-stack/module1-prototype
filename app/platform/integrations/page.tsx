import { Suspense } from 'react';
import { PlatformSyncPage } from '@/src/features/platform/sync-page';

export default function Page() { return <Suspense fallback={<p>Loading sync health…</p>}><PlatformSyncPage /></Suspense>; }
