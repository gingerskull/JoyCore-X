"use client"

import * as React from "react"
import * as ScrollAreaPrimitive from "@radix-ui/react-scroll-area"

import { cn } from "@/lib/utils"

interface JoyScrollAreaProps extends React.ComponentProps<typeof ScrollAreaPrimitive.Root> {
  indicators?: boolean // when true, apply mask-based fade (option 2)
  fadeSize?: number // px height of fade region (default 32)
}

function ScrollArea({
  className,
  children,
  indicators = false,
  fadeSize = 32,
  ...props
}: JoyScrollAreaProps) {
  const viewportRef = React.useRef<HTMLDivElement | null>(null)
  const [canScrollUp, setCanScrollUp] = React.useState(false)
  const [canScrollDown, setCanScrollDown] = React.useState(false)

  React.useEffect(() => {
    if (!indicators) return
    const el = viewportRef.current
    if (!el) return
    const update = () => {
      setCanScrollUp(el.scrollTop > 0)
      setCanScrollDown(el.scrollTop + el.clientHeight < el.scrollHeight - 1)
    }
    update()
    el.addEventListener('scroll', update, { passive: true })
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => {
      el.removeEventListener('scroll', update)
      ro.disconnect()
    }
  }, [indicators])

  // Keep mask logic (in case mask-capable browsers show smoother fade); overlays added for visual reliability.
  const maskStyles: React.CSSProperties | undefined = indicators
    ? (() => {
        const topStart = canScrollUp ? 'rgba(0,0,0,0)' : 'rgba(0,0,0,1)'
        const bottomEnd = canScrollDown ? 'rgba(0,0,0,0)' : 'rgba(0,0,0,1)'
        const fs = fadeSize
        const mask = `linear-gradient(to bottom, ${topStart} 0px, rgba(0,0,0,1) ${fs}px, rgba(0,0,0,1) calc(100% - ${fs}px), ${bottomEnd} 100%)`
        return {
          WebkitMaskImage: mask,
          maskImage: mask,
          WebkitMaskSize: '100% 100%',
          maskSize: '100% 100%',
          WebkitMaskRepeat: 'no-repeat',
          maskRepeat: 'no-repeat'
        }
      })()
    : undefined

  return (
    <ScrollAreaPrimitive.Root
      data-slot="scroll-area"
      className={cn('relative overflow-hidden', className)}
      {...props}
    >
      <ScrollAreaPrimitive.Viewport
        data-slot="scroll-area-viewport"
        ref={viewportRef}
        className="focus-visible:ring-ring/50 h-full w-full overflow-auto rounded-[inherit] transition-[color,box-shadow] outline-none focus-visible:ring-[3px] focus-visible:outline-1 [scrollbar-width:none] [&::-webkit-scrollbar]:w-0"
        style={maskStyles}
      >
        {children}
      </ScrollAreaPrimitive.Viewport>
      {indicators && (
        <>
          {/* Top fade overlay */}
          {canScrollUp && (
            <div
              aria-hidden
              className="pointer-events-none absolute left-0 right-0 top-0 z-10"
              style={{ height: fadeSize, background: 'linear-gradient(to bottom, hsl(var(--background)) 0%, hsl(var(--background)) 40%, color-mix(in srgb, hsl(var(--background)) 0%, transparent) 100%)' }}
            />
          )}
          {/* Bottom fade overlay */}
          {canScrollDown && (
            <div
              aria-hidden
              className="pointer-events-none absolute left-0 right-0 bottom-0 z-10"
              style={{ height: fadeSize, background: 'linear-gradient(to top, hsl(var(--background)) 0%, hsl(var(--background)) 40%, color-mix(in srgb, hsl(var(--background)) 0%, transparent) 100%)' }}
            />
          )}
        </>
      )}
      <ScrollBar />
      <ScrollAreaPrimitive.Corner />
    </ScrollAreaPrimitive.Root>
  )
}

function ScrollBar({
  className,
  orientation = "vertical",
  ...props
}: React.ComponentProps<typeof ScrollAreaPrimitive.ScrollAreaScrollbar>) {
  return (
    <ScrollAreaPrimitive.ScrollAreaScrollbar
      data-slot="scroll-area-scrollbar"
      orientation={orientation}
      className={cn(
        "flex touch-none p-px transition-colors select-none",
        orientation === "vertical" &&
          "h-full w-2.5 border-l border-l-transparent",
        orientation === "horizontal" &&
          "h-2.5 flex-col border-t border-t-transparent",
        className
      )}
      {...props}
    >
      <ScrollAreaPrimitive.ScrollAreaThumb
        data-slot="scroll-area-thumb"
        className="bg-border relative flex-1 rounded-full"
      />
    </ScrollAreaPrimitive.ScrollAreaScrollbar>
  )
}

export { ScrollArea, ScrollBar }
