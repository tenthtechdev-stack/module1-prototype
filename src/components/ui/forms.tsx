'use client';

import { Children, cloneElement, isValidElement, useId, useRef, type AriaAttributes, type InputHTMLAttributes, type ReactElement, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu';
import { CalendarDays, Check, ChevronDown, Search } from 'lucide-react';

interface FieldControlProps {
  id?: string;
  'aria-describedby'?: string;
  'aria-invalid'?: AriaAttributes['aria-invalid'];
}

function isFieldControl(element: ReactElement<FieldControlProps>) {
  return element.type === 'input'
    || element.type === 'select'
    || element.type === 'textarea'
    || element.type === Input
    || element.type === UnambiguousDateInput
    || element.type === SearchInput
    || element.type === Textarea
    || element.type === Select
    || element.type === MultiSelect;
}

function mergeDescribedBy(...values: Array<string | undefined>) {
  const ids = values.flatMap((value) => value?.split(/\s+/).filter(Boolean) ?? []);
  return ids.length ? [...new Set(ids)].join(' ') : undefined;
}

export function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string; children: ReactNode }) {
  const generatedId = useId();
  const child = Children.count(children) === 1 && isValidElement<FieldControlProps>(children) && isFieldControl(children) ? children : null;

  if (!child) {
    return <label className={`ui-field${error ? ' invalid' : ''}`}><span>{label}</span>{children}{error ? <small role="alert">{error}</small> : hint ? <small>{hint}</small> : null}</label>;
  }

  const controlId = child.props.id ?? `${generatedId}-control`;
  const messageId = error ? `${generatedId}-error` : hint ? `${generatedId}-hint` : undefined;
  const control = cloneElement(child, {
    id: controlId,
    'aria-describedby': mergeDescribedBy(child.props['aria-describedby'], messageId),
    'aria-invalid': error ? true : child.props['aria-invalid'],
  });

  return <div className={`ui-field${error ? ' invalid' : ''}`}><label htmlFor={controlId}>{label}</label>{control}{error ? <small id={messageId} role="alert">{error}</small> : hint ? <small id={messageId}>{hint}</small> : null}</div>;
}

export function Input({ className = '', ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`ui-input ${className}`.trim()} {...props} />;
}

function formatIsoDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return 'Choose date';
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${value}T00:00:00.000Z`));
}

export function UnambiguousDateInput({
  className = '',
  value,
  onChange,
  disabled,
  id,
  'aria-label': ariaLabel,
  'aria-describedby': ariaDescribedBy,
  'aria-invalid': ariaInvalid,
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  const pickerRef = useRef<HTMLInputElement>(null);
  const isoValue = typeof value === 'string' ? value : '';

  function openPicker() {
    if (disabled) return;
    const picker = pickerRef.current;
    if (!picker) return;
    if (typeof picker.showPicker === 'function') picker.showPicker();
    else picker.click();
  }

  return <span className={`ui-unambiguous-date ${className}`.trim()}>
    <button
      id={id}
      type="button"
      className="ui-unambiguous-date-display"
      disabled={disabled}
      aria-label={ariaLabel}
      aria-describedby={ariaDescribedBy}
      data-invalid={ariaInvalid ? 'true' : undefined}
      onClick={openPicker}
    >
      <span>{formatIsoDate(isoValue)}</span>
      <CalendarDays size={14} aria-hidden="true" />
    </button>
    <input
      {...props}
      ref={pickerRef}
      type="date"
      value={isoValue}
      onChange={onChange}
      disabled={disabled}
      tabIndex={-1}
      aria-label={`${ariaLabel ?? 'Date'} picker`}
      aria-invalid={ariaInvalid}
      className="ui-unambiguous-date-picker"
    />
  </span>;
}

export function SearchInput({ className = '', ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <span className={`ui-search-input ${className}`.trim()}><Search size={15} /><input {...props} /></span>;
}

export function Textarea({ className = '', ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={`ui-textarea ${className}`.trim()} {...props} />;
}

export function Select({ className = '', children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={`ui-select ${className}`.trim()} {...props}>{children}</select>;
}

export interface SelectMenuOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export function SelectMenu({
  value,
  onValueChange,
  options,
  ariaLabel,
  disabled = false,
  className = '',
  startIcon,
}: {
  value: string;
  onValueChange: (value: string) => void;
  options: SelectMenuOption[];
  ariaLabel: string;
  disabled?: boolean;
  className?: string;
  startIcon?: ReactNode;
}) {
  const selected = options.find((option) => option.value === value) ?? options[0];
  const selectedLabel = selected?.label ?? 'Select an option';

  return <DropdownMenuPrimitive.Root>
    <DropdownMenuPrimitive.Trigger
      type="button"
      className={`ui-select-menu-trigger ${className}`.trim()}
      disabled={disabled}
      aria-label={`${ariaLabel}: ${selectedLabel}`}
      title={selectedLabel}
    >
      {startIcon ? <span className="ui-select-menu-start-icon" aria-hidden="true">{startIcon}</span> : null}
      <span className="ui-select-menu-value">{selectedLabel}</span>
      <ChevronDown className="ui-select-menu-chevron" size={13} aria-hidden="true" />
    </DropdownMenuPrimitive.Trigger>
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content
        className="ui-select-menu-content"
        align="start"
        sideOffset={5}
        collisionPadding={10}
        aria-label={`${ariaLabel} options`}
      >
        <DropdownMenuPrimitive.RadioGroup value={value} onValueChange={onValueChange}>
          {options.map((option) => <DropdownMenuPrimitive.RadioItem
            className="ui-select-menu-item"
            disabled={option.disabled}
            key={option.value}
            value={option.value}
            title={option.label}
          >
            <span className="ui-select-menu-indicator" aria-hidden="true">
              <DropdownMenuPrimitive.ItemIndicator><Check size={13} /></DropdownMenuPrimitive.ItemIndicator>
            </span>
            <span>{option.label}</span>
          </DropdownMenuPrimitive.RadioItem>)}
        </DropdownMenuPrimitive.RadioGroup>
      </DropdownMenuPrimitive.Content>
    </DropdownMenuPrimitive.Portal>
  </DropdownMenuPrimitive.Root>;
}

export type MultiSelectProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, 'multiple'>;

export function MultiSelect({ className = '', children, ...props }: MultiSelectProps) {
  return <select {...props} className={`ui-select ui-multi-select ${className}`.trim()} multiple>{children}</select>;
}

export function Checkbox({ label, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return <label className="ui-choice"><input type="checkbox" {...props} /><span>{label}</span></label>;
}

export function Radio({ label, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return <label className="ui-choice"><input type="radio" {...props} /><span>{label}</span></label>;
}

export function Switch({ label, checked, onCheckedChange }: { label: string; checked: boolean; onCheckedChange: (checked: boolean) => void }) {
  return <button type="button" className="ui-switch-row" role="switch" aria-checked={checked} onClick={() => onCheckedChange(!checked)}><span className="ui-switch"><i /></span><span>{label}</span></button>;
}

export function DateRangeControl({ from, to, onChange }: { from: string; to: string; onChange: (range: { from: string; to: string }) => void }) {
  return <span className="ui-date-range"><input type="date" aria-label="Date range start" value={from} onChange={(event) => onChange({ from: event.target.value, to })} /><span>to</span><input type="date" aria-label="Date range end" value={to} onChange={(event) => onChange({ from, to: event.target.value })} /></span>;
}
