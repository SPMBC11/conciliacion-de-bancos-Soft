import { AlertDialog as A } from 'radix-ui';
import { type ReactNode, useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import { overlayClass } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/input';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  tone?: 'primary' | 'danger';
  /** Exige un motivo (deshacer conciliación, reabrir periodo…). Se entrega a onConfirm. */
  requireReason?: boolean;
  onConfirm: (reason?: string) => void;
};

export function ConfirmationDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  tone = 'primary',
  requireReason,
  onConfirm,
}: Props) {
  const [reason, setReason] = useState('');
  const reasonId = useId();
  const canConfirm = !requireReason || reason.trim().length >= 5;

  return (
    <A.Root
      open={open}
      onOpenChange={(o) => {
        if (!o) setReason('');
        onOpenChange(o);
      }}
    >
      <A.Portal>
        <A.Overlay className={overlayClass} />
        <A.Content className="fixed top-1/2 left-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-surface p-6 shadow-xl">
          <A.Title className="text-lg font-semibold">{title}</A.Title>
          <A.Description className="mt-2 text-sm text-muted-foreground">
            {description}
          </A.Description>
          {requireReason && (
            <div className="mt-4 space-y-1">
              <label htmlFor={reasonId} className="text-sm font-medium">
                Motivo (obligatorio, queda en auditoría)
              </label>
              <Textarea id={reasonId} value={reason} onChange={(e) => setReason(e.target.value)} />
            </div>
          )}
          <div className="mt-6 flex justify-end gap-2">
            <A.Cancel asChild>
              <Button variant="secondary">Cancelar</Button>
            </A.Cancel>
            <Button
              variant={tone}
              disabled={!canConfirm}
              onClick={() => {
                onConfirm(requireReason ? reason.trim() : undefined);
                onOpenChange(false);
                setReason('');
              }}
            >
              {confirmLabel}
            </Button>
          </div>
        </A.Content>
      </A.Portal>
    </A.Root>
  );
}
