import { FeaturePage } from '@/src/components/pages/feature-page';
export default async function Page({ params }: { params: Promise<{ transactionId: string }> }) { const { transactionId } = await params; return <FeaturePage eyebrow="Transaction detail" title="Transaction breakdown" description={`A reconciling profitability breakdown for ${transactionId}.`} capability="transactions.view" />; }
