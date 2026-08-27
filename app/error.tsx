'use client';
import { ErrorState } from '@/src/components/states/states';
export default function Error({ reset }: { reset: () => void }) { return <main className="standalone-state"><ErrorState title="The application hit an unexpected error" onRetry={reset} /></main>; }
