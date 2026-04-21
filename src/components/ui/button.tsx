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
        default: [
          'text-zinc-50',
          'bg-white/[0.09] backdrop-blur-xl',
          'border border-white/[0.14]',
          'shadow-[inset_0_1px_0_0_rgb(255_255_255/0.14),0_1px_0_0_rgb(0_0_0/0.35)]',
          'hover:bg-white/[0.13] hover:border-white/[0.18]',
        ].join(' '),
        secondary: [
          'text-zinc-200 bg-white/[0.04] border border-white/[0.08]',
          'hover:bg-white/[0.07] hover:border-white/[0.12]',
          'lit-top',
        ].join(' '),
        ghost:
          'bg-transparent text-zinc-400 hover:text-zinc-100 hover:bg-white/[0.05]',
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
