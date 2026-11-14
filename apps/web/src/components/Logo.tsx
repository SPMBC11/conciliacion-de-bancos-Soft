import { cn } from '@/lib/utils';

/** Logo textual de FinAgent AI. */
export function Logo({ compact, className }: { compact?: boolean; className?: string }) {
  return (
    <span className={cn('flex items-center gap-2 font-semibold tracking-tight', className)}>
      <span
        aria-hidden
        className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary text-sm font-bold text-primary-foreground"
      >
        F
      </span>
      {!compact && (
        <span className="text-base">
          FinAgent <span className="text-primary dark:text-primary-hover">AI</span>
        </span>
      )}
      {compact && <span className="sr-only">FinAgent AI</span>}
    </span>
  );
}
