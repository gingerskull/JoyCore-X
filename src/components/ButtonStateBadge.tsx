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
        "w-5 h-5 rounded flex items-center justify-center text-[8px] font-mono font-bold transition-colors duration-100 select-none",
        {
          // State 1: Gray/muted - Configured but no logical button assigned, not pressed
          "bg-gray-700 text-gray-400 border border-gray-600": state === 'unconfigured',
          // State 2: Blue/colored - Configured with logical button assigned, not pressed  
          "bg-blue-600 text-white border border-blue-500": state === 'configured',
          // State 3: Green/highlighted - Configured with logical button and currently pressed
          "bg-green-500 text-white border border-green-400 shadow-lg shadow-green-500/50": state === 'pressed',
          // State 4: Green/muted - Configured but no logical button assigned, currently pressed
          "bg-green-700 text-green-300 border border-green-600": state === 'pressed-unconfigured',
        },
        className
      )}
      title={label}
    >
      {label.replace(/[^0-9]/g, '') || '?'}
    </div>
  );
}