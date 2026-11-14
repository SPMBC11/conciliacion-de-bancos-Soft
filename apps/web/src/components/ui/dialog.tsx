import { Dialog as D } from 'radix-ui';
import { X } from 'lucide-react';
import type { ComponentProps, ReactNode } from 'react';
import { cn } from '@/lib/utils';

export const Dialog = D.Root;
export const DialogTrigger = D.Trigger;
export const DialogClose = D.Close;

export const overlayClass = 'fixed inset-0 z-50 bg-overlay';

type ContentProps = ComponentProps<typeof D.Content> & { title: string; description?: ReactNode };

/** Modal accesible (foco atrapado, Escape cierra, título anunciado por lectores de pantalla). */
export function DialogContent({ title, description, className, children, ...props }: ContentProps) {
  return (
    <D.Portal>
      <D.Overlay className={overlayClass} />
      <D.Content
        className={cn(
          'fixed top-1/2 left-1/2 z-50 w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-surface p-6 shadow-xl',
          className,
        )}
        {...(!description && { 'aria-describedby': undefined })}
        {...props}
      >
        <D.Title className="pr-8 text-lg font-semibold">{title}</D.Title>
        {description && (
          <D.Description className="mt-1 text-sm text-muted-foreground">
            {description}
          </D.Description>
        )}
        <div className="mt-4">{children}</div>
        <D.Close
          className="absolute top-4 right-4 rounded-md p-1 text-muted-foreground hover:bg-surface-secondary"
          aria-label="Cerrar"
        >
          <X className="size-4" />
        </D.Close>
      </D.Content>
    </D.Portal>
  );
}
