import { ProductDetailPage } from '@/src/features/products/product-detail-page';

export default async function Page({ params }: { params: Promise<{ productId: string }> }) {
  const { productId } = await params;
  // Dynamic params can remain percent-encoded when an internal ID contains a
  // delimiter such as `:`. Normalise once at the route boundary so list links,
  // direct URLs and repository keys resolve to the same stable identity.
  let decodedProductId = productId;
  try {
    decodedProductId = decodeURIComponent(productId);
  } catch {
    // Keep the original value so malformed URLs resolve through the normal
    // not-found state instead of crashing the route.
  }
  return <ProductDetailPage productId={decodedProductId} />;
}
