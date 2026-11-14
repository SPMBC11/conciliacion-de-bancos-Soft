import { parseAmount, sumCents, toAmountString } from '@finagent/domain';
import type { NormalizedTx } from './template.js';

export type BalanceCheck = {
  opening: string | null;
  closing: string | null;
  /** Total de entradas (positivo) y de salidas (positivo). */
  inflows: string;
  outflows: string;
  count: number;
  /** null si no hay saldos para verificar. */
  balanced: boolean | null;
  /** apertura + movimientos − cierre (≠ 0 ⇒ no cuadra). */
  difference: string | null;
  /** Filas cuyo saldo corrido no coincide con el anterior + importe. */
  runningBalanceErrors: number[];
  /** El archivo venía del más reciente al más antiguo. */
  reversed: boolean;
  from: string | null;
  to: string | null;
};

/**
 * Valida la ecuación de saldos: apertura + Σ importes con signo = cierre.
 * Extracto: + créditos − débitos. Auxiliar: + débitos − créditos (ya vienen con signo desde applyTemplate).
 * Con columna de saldo corrido: apertura = primer saldo − primer importe; cierre = último saldo.
 * Sin ella se usan los saldos que indique el usuario.
 */
export function checkBalances(
  txs: (NormalizedTx & { rowNumber: number })[],
  provided: { opening?: string | null; closing?: string | null } = {},
): BalanceCheck {
  const reversed = txs.length > 1 && txs[0]!.operationDate > txs[txs.length - 1]!.operationDate;
  const ordered = reversed ? [...txs].reverse() : txs;
  const amounts = ordered.map((t) => parseAmount(t.amount));
  const inflows = sumCents(amounts.filter((a) => a > 0n));
  const outflows = -sumCents(amounts.filter((a) => a < 0n));

  const withBalance = ordered.every((t) => t.balance !== null) && ordered.length > 0;
  const runningBalanceErrors: number[] = [];
  let opening = provided.opening ? parseAmount(provided.opening) : null;
  let closing = provided.closing ? parseAmount(provided.closing) : null;

  if (withBalance) {
    const first = ordered[0]!;
    opening ??= parseAmount(first.balance!) - parseAmount(first.amount);
    closing ??= parseAmount(ordered[ordered.length - 1]!.balance!);
    for (let i = 1; i < ordered.length; i++) {
      const expected = parseAmount(ordered[i - 1]!.balance!) + parseAmount(ordered[i]!.amount);
      if (expected !== parseAmount(ordered[i]!.balance!))
        runningBalanceErrors.push(ordered[i]!.rowNumber);
    }
  }

  const dates = ordered.map((t) => t.operationDate).sort();
  const diff = opening !== null && closing !== null ? opening + sumCents(amounts) - closing : null;
  return {
    opening: opening === null ? null : toAmountString(opening),
    closing: closing === null ? null : toAmountString(closing),
    inflows: toAmountString(inflows),
    outflows: toAmountString(outflows),
    count: ordered.length,
    balanced: diff === null ? null : diff === 0n && runningBalanceErrors.length === 0,
    difference: diff === null ? null : toAmountString(diff),
    runningBalanceErrors,
    reversed,
    from: dates[0] ?? null,
    to: dates[dates.length - 1] ?? null,
  };
}
