import * as React from "react"
import { Minus, Plus } from "lucide-react"
import { cn } from "@/lib/utils"

export interface NumberInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'onChange'> {
  value?: number
  onChange?: (value: number) => void
  min?: number
  max?: number
  step?: number
}

const NumberInput = React.forwardRef<HTMLInputElement, NumberInputProps>(
  ({ className, value, onChange, min, max, step = 1, disabled, ...props }, ref) => {
    const [internalValue, setInternalValue] = React.useState(value ?? 0)
    const [isHolding, setIsHolding] = React.useState<'increment' | 'decrement' | null>(null)
  // Refs need explicit initial value for strict TS; allow null until timers created
  const holdIntervalRef = React.useRef<NodeJS.Timeout | null>(null)
  const holdTimeoutRef = React.useRef<NodeJS.Timeout | null>(null)

    // Use internal value if no value prop provided (uncontrolled mode)
    const currentValue = value !== undefined ? value : internalValue

    const handleValueChange = (newValue: number) => {
      // Clamp value between min and max
      let clampedValue = newValue
      if (min !== undefined && newValue < min) clampedValue = min
      if (max !== undefined && newValue > max) clampedValue = max

      if (value === undefined) {
        setInternalValue(clampedValue)
      }
      onChange?.(clampedValue)
    }

    const increment = () => {
      handleValueChange(currentValue + step)
    }

    const decrement = () => {
      handleValueChange(currentValue - step)
    }

    const startHold = (action: 'increment' | 'decrement') => {
      setIsHolding(action)
      
      // Start with a delay, then repeat faster
      holdTimeoutRef.current = setTimeout(() => {
        holdIntervalRef.current = setInterval(() => {
          if (action === 'increment') increment()
          else decrement()
        }, 50) // Repeat every 50ms when holding
      }, 300) // Initial delay of 300ms
    }

    const stopHold = () => {
      setIsHolding(null)
  if (holdTimeoutRef.current) clearTimeout(holdTimeoutRef.current)
  if (holdIntervalRef.current) clearInterval(holdIntervalRef.current)
    }

    // Clean up on unmount
    React.useEffect(() => {
      return () => {
  if (holdTimeoutRef.current) clearTimeout(holdTimeoutRef.current)
  if (holdIntervalRef.current) clearInterval(holdIntervalRef.current)
      }
    }, [])

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value
      if (val === '' || val === '-') {
        // Allow empty or just minus sign temporarily
        if (value === undefined) {
          setInternalValue(0)
        }
        onChange?.(0)
        return
      }
      
      const parsed = parseInt(val, 10)
      if (!isNaN(parsed)) {
        handleValueChange(parsed)
      }
    }

    const isDecrementDisabled = disabled || (min !== undefined && currentValue <= min)
    const isIncrementDisabled = disabled || (max !== undefined && currentValue >= max)

    return (
      <div className="flex h-9 overflow-hidden rounded-md border border-input bg-transparent shadow-xs transition-[color,box-shadow]">
        <button
          type="button"
          className={cn(
            "flex h-full w-9 items-center justify-center border-r border-input bg-background transition-colors",
            "hover:bg-accent hover:text-accent-foreground",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
            "disabled:pointer-events-none disabled:opacity-50",
            isHolding === 'decrement' && "bg-accent"
          )}
          onClick={decrement}
          onMouseDown={() => startHold('decrement')}
          onMouseUp={stopHold}
          onMouseLeave={stopHold}
          onTouchStart={() => startHold('decrement')}
          onTouchEnd={stopHold}
          disabled={isDecrementDisabled}
          aria-label="Decrease value"
        >
          <Minus className="h-3 w-3" />
        </button>
        
        <input
          ref={ref}
          type="number"
          className={cn(
            "flex-1 bg-transparent px-3 py-1 text-center text-base outline-none md:text-sm",
            "placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground",
            "[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none",
            "disabled:cursor-not-allowed disabled:opacity-50",
            className
          )}
          value={currentValue}
          onChange={handleInputChange}
          min={min}
          max={max}
          step={step}
          disabled={disabled}
          {...props}
        />
        
        <button
          type="button"
          className={cn(
            "flex h-full w-9 items-center justify-center border-l border-input bg-background transition-colors",
            "hover:bg-accent hover:text-accent-foreground",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
            "disabled:pointer-events-none disabled:opacity-50",
            isHolding === 'increment' && "bg-accent"
          )}
          onClick={increment}
          onMouseDown={() => startHold('increment')}
          onMouseUp={stopHold}
          onMouseLeave={stopHold}
          onTouchStart={() => startHold('increment')}
          onTouchEnd={stopHold}
          disabled={isIncrementDisabled}
          aria-label="Increase value"
        >
          <Plus className="h-3 w-3" />
        </button>
      </div>
    )
  }
)

NumberInput.displayName = "NumberInput"

export { NumberInput }