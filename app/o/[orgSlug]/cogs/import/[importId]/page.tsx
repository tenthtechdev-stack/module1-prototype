import { CogsImportReviewPage } from '@/src/features/cogs/cogs-import-review-page';

export default async function Page({ params }: { params: Promise<{ importId: string }> }) {
  const { importId } = await params;
  return <CogsImportReviewPage importId={decodeURIComponent(importId)} />;
}
