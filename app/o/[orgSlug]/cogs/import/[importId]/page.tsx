import { FeaturePage } from '@/src/components/pages/feature-page';
export default async function Page({ params }: { params: Promise<{ importId: string }> }) { const { importId } = await params; return <FeaturePage eyebrow="Import review" title="Review COGS import" description={`Validation and approval state for import ${importId}.`} capability="cogs.approve" />; }
