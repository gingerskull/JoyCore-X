import * as React from 'react';
import { Badge as UIBadge } from '@/components/ui/badge';
import type { BadgeVariantProp } from '@/components/ui/badge-variants';
import { cn } from '@/lib/utils';

// Supported variants after legacy purge
const variantMap: Record<string, BadgeVariantProp> = {
  default: 'default',
  primary: 'default', // still allow "primary"
  secondary: 'secondary',
  destructive: 'destructive',
  success: 'success',
  warning: 'warning',
  info: 'info',
  muted: 'muted',
  brand1: 'brand1',
  brand2: 'brand2',
  brand3: 'brand3',
  brand4: 'brand4',
  brand5: 'brand5',
  // Aliases used by RawStateBadge
  green: 'success',
  blue: 'info',
  gray: 'muted',
};

export interface BadgeProps extends Omit<React.ComponentProps<typeof UIBadge>, 'variant'> {
  variant?: keyof typeof variantMap;
  size?: 'sm' | 'md' | 'lg';
  inactive?: boolean; // used for styling/accessibility; not forwarded as a DOM attr
}

export function Badge({ variant = 'default', size = 'md', className, inactive, ...rest }: BadgeProps) {
  const mapped: BadgeVariantProp = variantMap[variant] ?? 'default';
  const sizeClasses =
    size === 'sm'
      ? 'h-5 px-1.5 text-[10px]'
      : size === 'lg'
      ? 'h-8 px-3 text-sm'
      : 'h-6 px-2'; // md

  return (
    <UIBadge
      variant={mapped}
      className={cn(sizeClasses, inactive ? 'opacity-70' : '', className)}
      aria-disabled={inactive ? true : undefined}
      {...rest}
    />
  );
}

export default Badge;
