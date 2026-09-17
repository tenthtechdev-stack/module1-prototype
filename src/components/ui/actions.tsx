import type { ButtonHTMLAttributes } from 'react';
import { LoaderCircle } from 'lucide-react';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'compact' | 'default' | 'large';
  loading?: boolean;
}

export function Button({ variant = 'secondary', size = 'default', loading = false, className = '', children, disabled, ...props }: ButtonProps) {
  return <button className={`ui-button ${variant} ${size} ${className}`.trim()} disabled={disabled || loading} {...props} aria-busy={loading || props['aria-busy'] || undefined}>{loading ? <LoaderCircle className="spin" size={15} /> : null}{children}</button>;
}

export function IconButton({ label, className = '', children, ...props }: Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label'> & { label: string }) {
  return <button className={`ui-icon-button ${className}`.trim()} aria-label={label} title={label} {...props}>{children}</button>;
}
