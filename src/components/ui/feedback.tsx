'use client';

import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, Info, TriangleAlert, X } from 'lucide-react';
import { IconButton } from '@/src/components/ui/actions';

export type Tone = 'neutral' | 'positive' | 'warning' | 'negative' | 'info';

export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: React.ReactNode }) {
  return <span className={`ui-badge ${tone}`}>{children}</span>;
}

export function Alert({ tone = 'info', title, children }: { tone?: Exclude<Tone, 'neutral'>; title: string; children?: React.ReactNode }) {
  const Icon = tone === 'positive' ? CheckCircle2 : tone === 'warning' ? TriangleAlert : tone === 'negative' ? AlertCircle : Info;
  return <div className={`ui-alert ${tone}`} role={tone === 'negative' ? 'alert' : 'status'}><Icon size={17} /><div><strong>{title}</strong>{children ? <p>{children}</p> : null}</div></div>;
}

export function Spinner({ label = 'Loading' }: { label?: string }) {
  return <span className="ui-spinner" role="status"><i /><span className="sr-only">{label}</span></span>;
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <span className={`skeleton ${className}`.trim()} aria-hidden="true" />;
}

interface ToastItem { id: number; message: string; tone: Tone }
interface ToastContextValue { showToast: (message: string, tone?: Tone) => void }
const ToastContext = createContext<ToastContextValue | null>(null);

function ToastIcon({ tone }: { tone: Tone }) {
  const Icon = tone === 'positive' ? CheckCircle2 : tone === 'warning' ? TriangleAlert : tone === 'negative' ? AlertCircle : Info;
  const color = tone === 'neutral' ? 'var(--text-muted)' : `var(--${tone})`;
  return <Icon size={16} color={color} aria-hidden="true" />;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(0);
  const showToast = useCallback((message: string, tone: Tone = 'positive') => {
    const id = ++nextId.current;
    setItems((current) => [...current, { id, message, tone }]);
    window.setTimeout(() => setItems((current) => current.filter((item) => item.id !== id)), 3200);
  }, []);
  const value = useMemo(() => ({ showToast }), [showToast]);
  return <ToastContext.Provider value={value}>{children}<div className="toast-viewport">{items.map((item) => <div key={item.id} className={`ui-toast ${item.tone}`} role={item.tone === 'negative' ? 'alert' : 'status'}><ToastIcon tone={item.tone} /><span>{item.message}</span><IconButton label="Dismiss notification" onClick={() => setItems((current) => current.filter((candidate) => candidate.id !== item.id))}><X size={14} /></IconButton></div>)}</div></ToastContext.Provider>;
}

export function useToast() {
  const value = useContext(ToastContext);
  if (!value) throw new Error('useToast must be used within ToastProvider.');
  return value;
}
