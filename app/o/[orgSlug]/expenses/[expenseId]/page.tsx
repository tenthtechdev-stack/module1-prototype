import { ExpenseDetailPage } from '@/src/features/expenses/expense-detail-page';
export default async function Page({ params }: { params: Promise<{ expenseId: string }> }) {
  const { expenseId } = await params;
  let decoded = expenseId;
  try { decoded = decodeURIComponent(expenseId); } catch { /* Invalid IDs use the safe not-found state. */ }
  return <ExpenseDetailPage expenseId={decoded} />;
}