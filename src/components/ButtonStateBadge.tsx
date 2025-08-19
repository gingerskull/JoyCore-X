import { cn } from '@/lib/utils';

interface ButtonStateBadgeProps {
  label: string;
  state: 'unconfigured' | 'configured' | 'pressed' | 'pressed-unconfigured';
  className?: string;
}

export function ButtonStateBadge({ label, state, className }: ButtonStateBadgeProps) {
  return (
    <div   
      className={cn(
        "w-12 h-12 rounded flex items-center justify-center text-[12px] font-mono font-bold transition-colors duration-50 select-none",
        {
          // State 1: Gray/muted - Configured but no logical button assigned, not pressed
          "bg-gray-600/10 text-gray-400/50 border border-gray-600/50": state === 'unconfigured',
          // State 2: Blue/colored - Configured with logical button assigned, not pressed  
          "bg-gray-600 text-white border border-gray-500": state === 'configured',
          // State 3: Green/highlighted - Configured with logical button and currently pressed
          "bg-red-500 text-white border border-red-400 shadow-lg shadow-red-500/50": state === 'pressed',
          // State 4: Red/muted - Configured but no logical button assigned, currently pressed
          "bg-red-500/50 text-red-300 border border-red-400/50": state === 'pressed-unconfigured',
        },
        className
      )}
      title={label}
    >
      {label.replace(/[^0-9]/g, '') || '?'}
    </div>
  );
}