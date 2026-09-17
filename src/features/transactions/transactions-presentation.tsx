import { AlertCircle, ArrowDownRight, ArrowUpRight, CheckCircle2, RotateCcw } from 'lucide-react';
import type { TransactionProfitabilityStatus } from '@/src/domain/transactions';
import { Badge } from '@/src/components/ui/feedback';

export const TRANSACTION_STATUS_LABELS: Record<TransactionProfitabilityStatus, string> = {
  profitable: 'Profitable', low_margin: 'Low margin', loss_making: 'Loss-making', incomplete: 'Incomplete', refunded: 'Refunded',
};

export function TransactionStatusBadge({ status }: { status: TransactionProfitabilityStatus }) {
  const Icon = status === 'profitable' ? CheckCircle2 : status === 'loss_making' ? ArrowDownRight : status === 'refunded' ? RotateCcw : status === 'incomplete' ? AlertCircle : ArrowUpRight;
  return <Badge tone={status === 'profitable' ? 'positive' : status === 'loss_making' ? 'negative' : status === 'refunded' ? 'info' : 'warning'}><Icon size={12} aria-hidden="true" />{TRANSACTION_STATUS_LABELS[status]}</Badge>;
}
