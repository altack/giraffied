import { cn } from '@/lib/cn';

/** Inline count span that plays a short slide-up keyframe on value change.
 *  The trick is `key={value}` — React remounts on value change, which re-
 *  fires the mount animation. Identical values don't remount, so a normal
 *  re-render pass doesn't cause churn. The wrapper is inline-block so the
 *  translateY doesn't disturb the parent's baseline. */
export function AnimatedCount({
  value,
  className,
}: {
  value: number;
  className?: string;
}) {
  return (
    <span
      key={value}
      className={cn('inline-block jfd-count-roll', className)}
    >
      {value}
    </span>
  );
}
