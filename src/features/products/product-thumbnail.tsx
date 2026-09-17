import {
  Boxes,
  ClipboardCheck,
  Package,
  ScrollText,
  ShieldCheck,
  SprayCan,
  type LucideIcon,
} from 'lucide-react';

const CATEGORY_VISUALS: Array<{
  match: RegExp;
  icon: LucideIcon;
  tone: string;
}> = [
  { match: /clean|janitorial|chemical|hygiene/i, icon: SprayCan, tone: 'aqua' },
  { match: /ppe|safety|glove|apron/i, icon: ShieldCheck, tone: 'blue' },
  { match: /paper|towel|roll/i, icon: ScrollText, tone: 'sand' },
  { match: /warehouse|pack|wrap|tape/i, icon: Boxes, tone: 'violet' },
  { match: /office|stationery/i, icon: ClipboardCheck, tone: 'slate' },
];

function visualFor(category?: string) {
  return CATEGORY_VISUALS.find((visual) => visual.match.test(category ?? ''))
    ?? { icon: Package, tone: 'slate' };
}

export function ProductThumbnail({
  category,
  size = 'compact',
  label,
}: {
  category?: string;
  size?: 'compact' | 'default' | 'large';
  /** Omit when adjacent product text already provides the accessible name. */
  label?: string;
}) {
  const { icon: Icon, tone } = visualFor(category);
  return (
    <span
      className={`product-thumbnail ${size} tone-${tone}`}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <Icon size={size === 'large' ? 28 : size === 'default' ? 20 : 16} strokeWidth={1.8} />
    </span>
  );
}
