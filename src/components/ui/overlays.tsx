'use client';

import { useId, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu';
import * as PopoverPrimitive from '@radix-ui/react-popover';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import { ChevronDown, X } from 'lucide-react';
import { Button, IconButton, type ButtonProps } from '@/src/components/ui/actions';

export function Tooltip({ label, children }: { label: string; children: React.ReactNode }) {
  return <TooltipPrimitive.Root><TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger><TooltipPrimitive.Portal><TooltipPrimitive.Content className="tooltip-content" sideOffset={6}>{label}<TooltipPrimitive.Arrow className="tooltip-arrow" /></TooltipPrimitive.Content></TooltipPrimitive.Portal></TooltipPrimitive.Root>;
}

export function Popover({ label, contentLabel = label, children }: { label: string; contentLabel?: string; children: React.ReactNode }) {
  return <PopoverPrimitive.Root><PopoverPrimitive.Trigger type="button" className="ui-popover-trigger">{label}<ChevronDown size={13} /></PopoverPrimitive.Trigger><PopoverPrimitive.Portal><PopoverPrimitive.Content className="ui-popover-content" align="end" sideOffset={6} collisionPadding={8} aria-label={contentLabel}>{children}</PopoverPrimitive.Content></PopoverPrimitive.Portal></PopoverPrimitive.Root>;
}

export interface DropdownMenuItem {
  label: string;
  onSelect?: () => void;
  danger?: boolean;
  disabled?: boolean;
}

export function DropdownMenu({ label, accessibleLabel, items }: { label: React.ReactNode; accessibleLabel?: string; items: DropdownMenuItem[] }) {
  const labelText = accessibleLabel ?? (typeof label === 'string' ? label : 'Actions');
  return <DropdownMenuPrimitive.Root><DropdownMenuPrimitive.Trigger type="button" className="ui-popover-trigger" aria-label={labelText}>{label}<ChevronDown size={13} /></DropdownMenuPrimitive.Trigger><DropdownMenuPrimitive.Portal><DropdownMenuPrimitive.Content className="ui-popover-content ui-dropdown-content" align="end" sideOffset={6} collisionPadding={8} aria-label={`${labelText} options`}>{items.map((item) => <DropdownMenuPrimitive.Item className={`ui-dropdown-item${item.danger ? ' danger' : ''}`} disabled={item.disabled} key={item.label} onSelect={item.onSelect}>{item.label}</DropdownMenuPrimitive.Item>)}</DropdownMenuPrimitive.Content></DropdownMenuPrimitive.Portal></DropdownMenuPrimitive.Root>;
}

export function Tabs({ tabs, ariaLabel = 'Tabs' }: { tabs: Array<{ id: string; label: string; content: React.ReactNode }>; ariaLabel?: string }) {
  const baseId = useId();
  const [activeId, setActiveId] = useState(tabs[0]?.id);
  const active = tabs.find((tab) => tab.id === activeId) ?? tabs[0];
  function selectByKeyboard(event: React.KeyboardEvent<HTMLButtonElement>, index: number) {
    let nextIndex = index;
    if (event.key === 'ArrowRight') nextIndex = (index + 1) % tabs.length;
    else if (event.key === 'ArrowLeft') nextIndex = (index - 1 + tabs.length) % tabs.length;
    else if (event.key === 'Home') nextIndex = 0;
    else if (event.key === 'End') nextIndex = tabs.length - 1;
    else return;
    event.preventDefault();
    const next = tabs[nextIndex];
    setActiveId(next.id);
    document.getElementById(`${baseId}-tab-${next.id}`)?.focus();
  }
  return <div className="ui-tabs"><div role="tablist" aria-label={ariaLabel}>{tabs.map((tab, index) => <button id={`${baseId}-tab-${tab.id}`} key={tab.id} type="button" role="tab" tabIndex={tab.id === active?.id ? 0 : -1} aria-selected={tab.id === active?.id} aria-controls={`${baseId}-panel-${tab.id}`} onClick={() => setActiveId(tab.id)} onKeyDown={(event) => selectByKeyboard(event, index)}>{tab.label}</button>)}</div>{active ? <div role="tabpanel" id={`${baseId}-panel-${active.id}`} aria-labelledby={`${baseId}-tab-${active.id}`} tabIndex={0}>{active.content}</div> : null}</div>;
}

interface DialogFrameProps {
  trigger?: React.ReactNode;
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  drawer?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onEscapeKeyDown?: (event: KeyboardEvent) => void;
}

export function DialogFrame({ trigger, title, description, children, footer, drawer = false, open, onOpenChange, onEscapeKeyDown }: DialogFrameProps) {
  return <Dialog.Root open={open} onOpenChange={onOpenChange}>{trigger ? <Dialog.Trigger asChild>{trigger}</Dialog.Trigger> : null}<Dialog.Portal><Dialog.Overlay className="drawer-overlay" /><Dialog.Content className={drawer ? 'ui-drawer' : 'ui-dialog'} onEscapeKeyDown={onEscapeKeyDown}><header><div><Dialog.Title>{title}</Dialog.Title>{description ? <Dialog.Description>{description}</Dialog.Description> : null}</div><Dialog.Close asChild><IconButton label="Close dialog"><X size={17} /></IconButton></Dialog.Close></header><div className="ui-dialog-body">{children}</div>{footer ? <footer><Dialog.Close asChild><Button>Cancel</Button></Dialog.Close>{footer}</footer> : null}</Dialog.Content></Dialog.Portal></Dialog.Root>;
}

export function Modal(props: DialogFrameProps) { return <DialogFrame {...props} />; }
export function Drawer(props: DialogFrameProps) { return <DialogFrame {...props} drawer />; }

export function ConfirmationDialog({ trigger, title, description, onConfirm, confirmLabel = 'Confirm', confirmVariant = 'danger', confirmLoading = false }: { trigger: React.ReactNode; title: string; description: string; onConfirm: () => void; confirmLabel?: string; confirmVariant?: ButtonProps['variant']; confirmLoading?: boolean }) {
  return <Dialog.Root><Dialog.Trigger asChild>{trigger}</Dialog.Trigger><Dialog.Portal><Dialog.Overlay className="drawer-overlay" /><Dialog.Content className="ui-dialog confirmation-dialog"><header><div><Dialog.Title>{title}</Dialog.Title><Dialog.Description>{description}</Dialog.Description></div></header><footer><Dialog.Close asChild><Button>Cancel</Button></Dialog.Close><Dialog.Close asChild><Button variant={confirmVariant} loading={confirmLoading} onClick={onConfirm}>{confirmLabel}</Button></Dialog.Close></footer></Dialog.Content></Dialog.Portal></Dialog.Root>;
}
