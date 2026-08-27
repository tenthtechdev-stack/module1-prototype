'use client';
import { ErrorState } from '@/src/components/states/states';
export default function Error({ reset }: { reset: () => void }) { return <ErrorState title="This platform page could not be loaded" onRetry={reset} />; }
