import { ProductGroupDetailPage } from '@/src/features/cogs/product-groups/product-group-detail-page';

export default async function Page({ params }: { params: Promise<{ groupId: string }> }) {
  const { groupId } = await params;
  let decodedGroupId = groupId;
  try {
    decodedGroupId = decodeURIComponent(groupId);
  } catch {
    // A malformed ID resolves through the feature's normal not-found state.
  }
  return <ProductGroupDetailPage groupId={decodedGroupId} />;
}
