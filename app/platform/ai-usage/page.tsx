import { Suspense } from 'react';
import { PlatformAIUsagePage } from '@/src/features/platform/ai-usage-page';

export default function Page() { return <Suspense fallback={<p>Loading AI usage…</p>}><PlatformAIUsagePage /></Suspense>; }
