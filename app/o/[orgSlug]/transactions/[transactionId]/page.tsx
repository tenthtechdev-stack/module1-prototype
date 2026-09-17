import { TransactionDetailPage } from '@/src/features/transactions/transaction-detail-page';

export default async function Page({ params }: { params: Promise<{ transactionId: string }> }) {
  const { transactionId } = await params;
  let decodedId = transactionId;
  try { decodedId = decodeURIComponent(transactionId); } catch { /* Malformed IDs resolve through the non-enumerating lookup. */ }
  return <TransactionDetailPage transactionId={decodedId} />;
}
