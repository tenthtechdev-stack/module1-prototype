import { AuthPage } from '@/src/components/pages/public-pages';
export default async function Page({ params }: { params: Promise<{ token: string }> }) { const { token } = await params; return <AuthPage type="invite" token={token} />; }
