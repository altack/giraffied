import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/cn';

const buttonVariants = cva(
  [
    'inline-flex items-center justify-center gap-2 rounded-md text-[13px] font-medium',
    'transition-all duration-150',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/60',
    'disabled:pointer-events-none disabled:opacity-50',
  ].join(' '),
  {
    variants: {
      variant: {
        // Primary: pearled/glass surface in dark; in light theme the overlay
        // tokens flip to dark-on-white, so the button reads as a solid dark
        // chip instead of an invisible white-on-white pill.
        default: [
          'text-[var(--color-ink)]',
          'bg-[var(--color-overlay-strong)] backdrop-blur-xl',
          'border border-[var(--color-hairline-loud)]',
          'shadow-[inset_0_1px_0_0_var(--color-lit-top),0_1px_0_0_rgb(0_0_0/0.25)]',
          'hover:bg-[var(--color-overlay-loud)]',
        ].join(' '),
        secondary: [
          'text-[var(--color-ink)]',
          'bg-[var(--color-overlay-soft)]',
          'border border-[var(--color-hairline-strong)]',
          'hover:bg-[var(--color-overlay-1)]',
          'lit-top',
        ].join(' '),
        ghost: [
          'bg-transparent text-[var(--color-ink-muted)]',
          'hover:text-[var(--color-ink)] hover:bg-[var(--color-overlay-1)]',
        ].join(' '),
        destructive:
          'bg-red-600/90 text-white hover:bg-red-500 shadow-[inset_0_1px_0_0_rgb(255_255_255/0.12)]',
      },
      size: {
        default: 'h-8 px-3.5',
        sm: 'h-7 px-2.5 text-[12px]',
        lg: 'h-9 px-4',
        icon: 'h-7 w-7 p-0',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />
  ),
);
Button.displayName = 'Button';
