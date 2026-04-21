import { forwardRef, type InputHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

export type InputProps = InputHTMLAttributes<HTMLInputElement>;

export const Input = forwardRef<HTMLInputElement, InputProps>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    className={cn(
      'flex h-8 w-full rounded-md px-3 text-[13px] text-zinc-100',
      'bg-white/[0.03] border border-white/[0.08]',
      'placeholder:text-zinc-600',
      'focus-visible:outline-none focus-visible:border-indigo-400/50 focus-visible:ring-2 focus-visible:ring-indigo-400/20',
      'disabled:cursor-not-allowed disabled:opacity-50',
      'transition-colors duration-150',
      className,
    )}
    {...props}
  />
));
Input.displayName = 'Input';
