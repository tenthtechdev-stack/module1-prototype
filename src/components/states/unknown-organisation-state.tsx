import Link from 'next/link';
import { SearchX } from 'lucide-react';

export function UnknownOrganisationState() {
  return (
    <main className="standalone-state">
      <span><SearchX size={24} /></span>
      <p className="eyebrow">Organisation not found</p>
      <h1>This organisation is not available</h1>
      <p>The organisation in this link does not exist in the prototype repository.</p>
      <Link className="primary-button" href="/o/stock-supplies/dashboard">Open the primary demonstration workspace</Link>
    </main>
  );
}
