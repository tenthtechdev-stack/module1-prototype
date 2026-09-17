import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/src/components/ui/actions';

export function Breadcrumbs({ items }: { items: Array<{ label: string; href?: string }> }) {
  return <nav className="ui-breadcrumbs" aria-label="Breadcrumb"><ol>{items.map((item, index) => <li key={`${item.label}-${index}`}>{item.href ? <Link href={item.href}>{item.label}</Link> : <span aria-current="page">{item.label}</span>}</li>)}</ol></nav>;
}

export function Pagination({ page, pageCount, onPageChange }: { page: number; pageCount: number; onPageChange: (page: number) => void }) {
  return <nav className="ui-pagination" aria-label="Pagination"><Button size="compact" onClick={() => onPageChange(page - 1)} disabled={page <= 1}><ChevronLeft size={14} /> Previous</Button><span>Page {page} of {pageCount}</span><Button size="compact" onClick={() => onPageChange(page + 1)} disabled={page >= pageCount}>Next <ChevronRight size={14} /></Button></nav>;
}
