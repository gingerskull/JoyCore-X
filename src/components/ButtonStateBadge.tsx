import { cn } from '@/lib/utils';
import { Badge } from './Badge';
import type { BadgeVariant } from './Badge';

interface ButtonStateBadgeProps {
  label: string;
  state: 'unconfigured' | 'configured' | 'pressed' | 'pressed-unconfigured';
  className?: string;
}

export function ButtonStateBadge({ label, state, className }: ButtonStateBadgeProps) {
  const { variant, inactive, pressed } = ((): { variant: BadgeVariant; inactive?: boolean; pressed?: boolean } => {
    switch (state) {
      case 'unconfigured':
        return { variant: 'gray', inactive: true };
      case 'configured':
        return { variant: 'blue' };
      case 'pressed':
        return { variant: 'red', pressed: true };
      case 'pressed-unconfigured':
        return { variant: 'red', inactive: true };
      default:
        return { variant: 'gray', inactive: true };
    }
  })();

  return (
    <Badge
      size="md"
  variant={variant}
      inactive={inactive}
      pressed={pressed}
      className={cn(className)}
      title={label}
    >
      {label.replace(/[^0-9]/g, '') || '?'}
    </Badge>
  );
}