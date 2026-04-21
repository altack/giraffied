import { forwardRef, type LabelHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

export const Label = forwardRef<HTMLLabelElement, LabelHTMLAttributes<HTMLLabelElement>>(
  ({ className, ...props }, ref) => (
    <label
      ref={ref}
      className={cn(
        'text-[10px] font-semibold text-zinc-500 uppercase tracking-[0.12em]',
        className,
      )}
      {...props}
    />
  ),
);
Label.displayName = 'Label';
