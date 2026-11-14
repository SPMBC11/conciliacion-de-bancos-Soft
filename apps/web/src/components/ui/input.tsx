import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

export const fieldClass =
  'h-9 rounded-lg border border-border bg-surface px-3 text-sm text-foreground placeholder:text-muted-foreground disabled:opacity-50';

export function Input({ className, ...props }: ComponentProps<'input'>) {
  return <input className={cn(fieldClass, 'w-full', className)} {...props} />;
}

/** Select nativo: accesible y usable en móvil sin JavaScript extra. */
export function NativeSelect({ className, ...props }: ComponentProps<'select'>) {
  return <select className={cn(fieldClass, 'pr-8', className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  return (
    <textarea className={cn(fieldClass, 'h-auto min-h-20 w-full py-2', className)} {...props} />
  );
}
