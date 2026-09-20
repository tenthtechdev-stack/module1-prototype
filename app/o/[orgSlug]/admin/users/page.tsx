import { Suspense } from 'react';
import { UsersPage } from '@/src/features/admin/users-page';
export default function Page() { return <Suspense fallback={null}><UsersPage /></Suspense>; }
