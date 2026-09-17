import Link from 'next/link';
import { SearchX } from 'lucide-react';

// Preserve the authenticated record-not-found experience when replacing the public 404.
export default function NotFound() {
  return <main className="standalone-state"><span><SearchX size={24} /></span><p className="eyebrow">Not found</p><h1>This page is outside the prototype dataset</h1><p>The organisation or record in this link does not exist, or is not visible in your current assignment.</p><Link className="primary-button" href="/o/stock-supplies/dashboard">Return to dashboard</Link></main>;
}
