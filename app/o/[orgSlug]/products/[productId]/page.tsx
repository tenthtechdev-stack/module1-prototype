import { FeaturePage } from '@/src/components/pages/feature-page';
export default async function Page({ params }: { params: Promise<{ productId: string }> }) { const { productId } = await params; return <FeaturePage eyebrow="Product detail" title="Product profitability" description={`Financial breakdown, listings and COGS history for ${productId}.`} capability="products.view" />; }
