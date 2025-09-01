import { cva, type VariantProps } from "class-variance-authority";

export const badgeVariants = cva(
  "inline-flex items-center justify-center rounded border px-2 py-0.5 text-xs font-semibold w-fit whitespace-nowrap shrink-0 [&>svg]:size-3 gap-1 [&>svg]:pointer-events-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive transition-[color,box-shadow] overflow-hidden select-none",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground [a&]:hover:bg-primary/90",
        secondary: "border-transparent bg-secondary text-secondary-foreground [a&]:hover:bg-secondary/90",
        destructive: "border-transparent bg-destructive text-destructive-foreground [a&]:hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40",
        outline: "text-foreground [a&]:hover:bg-accent [a&]:hover:text-accent-foreground",
        success: "border-transparent bg-success text-success-foreground [a&]:hover:bg-success/90",
        warning: "border-transparent bg-warning text-warning-foreground [a&]:hover:bg-warning/90",
        info: "border-transparent bg-info text-info-foreground [a&]:hover:bg-info/90",
        muted: "border-transparent bg-muted text-muted-foreground [a&]:hover:bg-muted/90",
        brand1: "border-transparent bg-brand-1 text-brand-1-foreground [a&]:hover:bg-brand-1/90",
        brand2: "border-transparent bg-brand-2 text-brand-2-foreground [a&]:hover:bg-brand-2/90",
        brand3: "border-transparent bg-brand-3 text-brand-3-foreground [a&]:hover:bg-brand-3/90",
        brand4: "border-transparent bg-brand-4 text-brand-4-foreground [a&]:hover:bg-brand-4/90",
        brand5: "border-transparent bg-brand-5 text-brand-5-foreground [a&]:hover:bg-brand-5/90",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export type BadgeVariantProp = NonNullable<VariantProps<typeof badgeVariants>["variant"]>;
