import { AlertCircle } from 'lucide-react';
import { type ReactNode, useId } from 'react';
import { cn } from '@/lib/utils';

/** Campo con etiqueta, ayuda y error accesibles (aria-describedby / aria-invalid). */
export function Field({
  label,
  error,
  hint,
  children,
}: {
  label: string;
  error?: string;
  hint?: string;
  children: (props: {
    id: string;
    'aria-invalid'?: boolean;
    'aria-describedby'?: string;
  }) => ReactNode;
}) {
  const id = useId();
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      {children({
        id,
        ...(error && { 'aria-invalid': true }),
        ...(describedBy && { 'aria-describedby': describedBy }),
      })}
      {error ? (
        <p id={`${id}-error`} className="text-xs text-danger-text">
          {error}
        </p>
      ) : (
        hint && (
          <p id={`${id}-hint`} className="text-xs text-muted-foreground">
            {hint}
          </p>
        )
      )}
    </div>
  );
}

export function FormAlert({
  children,
  tone = 'danger',
}: {
  children: ReactNode;
  tone?: 'danger' | 'success';
}) {
  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      className={cn(
        'flex items-start gap-2 rounded-lg px-3 py-2 text-sm',
        tone === 'danger' ? 'bg-danger/10 text-danger-text' : 'bg-success/10 text-success-text',
      )}
    >
      <AlertCircle aria-hidden className="mt-0.5 size-4 shrink-0" />
      <span>{children}</span>
    </div>
  );
}
