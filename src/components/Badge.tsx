import { cn } from '@/lib/utils';
import React from 'react';

export type BadgeVariant = 'yellow' | 'pink' | 'blue' | 'purple' | 'teal' | 'green' | 'red' | 'gray' |'success';
export type BadgeSize = 'sm' | 'md' | 'lg';

interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: BadgeVariant;
  size?: BadgeSize;
  inactive?: boolean;
  pressed?: boolean;
  children: React.ReactNode;
  className?: string;
}

export function Badge({ variant = 'gray', size = 'md', inactive, pressed, children, className, ...rest }: BadgeProps) {
  return (
    <div
      data-size={size}
      className={cn(
        'badge',
        `badge-${variant}`,
        inactive && 'badge-inactive',
        pressed && 'badge-pressed',
        className
      )}
      {...rest}
    >
      {children}
    </div>
  );
}
