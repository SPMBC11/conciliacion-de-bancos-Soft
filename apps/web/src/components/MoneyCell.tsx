import { type Currency, formatMoney, isNegative } from '@/lib/format';
import { cn } from '@/lib/utils';

/** Importe con cifras tabulares, alineado a la derecha; negativo con signo “−” y color de peligro. */
export function MoneyCell({
  amount,
  currency = 'COP',
  className,
}: {
  amount: string;
  currency?: Currency;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'block text-right tabular whitespace-nowrap',
        isNegative(amount) && 'text-danger-text',
        className,
      )}
    >
      {formatMoney(amount, currency)}
    </span>
  );
}
