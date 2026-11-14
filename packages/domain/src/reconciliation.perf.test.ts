import { expect, it } from 'vitest';
import { suggestMatches, type MatchTransaction } from './reconciliation.js';

const runtime = globalThis as typeof globalThis & {
  process?: { env?: Record<string, string | undefined> };
};

it.runIf(runtime.process?.env?.PERF === '1')(
  'propone 25.000 conciliaciones en un lote de 50.000 movimientos',
  { timeout: 300_000 },
  () => {
    const transactions: MatchTransaction[] = [];
    for (let i = 0; i < 25_000; i++) {
      const amountCents = BigInt((i + 1) * 137);
      const date = '2026-10-15';
      const reference = `PERF-${i}`;
      transactions.push(
        {
          id: `bank-${i}`,
          side: 'BANK',
          date,
          amountCents: -amountCents,
          currency: 'COP',
          reference,
          description: `PAGO ${reference}`,
          duplicateStatus: 'NONE',
        },
        {
          id: `book-${i}`,
          side: 'BOOK',
          date,
          amountCents,
          currency: 'COP',
          reference,
          description: `PAGO ${reference}`,
          duplicateStatus: 'NONE',
        },
      );
    }
    const started = Date.now();
    const suggestions = suggestMatches(transactions);
    const duration = Date.now() - started;
    expect(suggestions).toHaveLength(25_000);
    expect(duration).toBeLessThan(120_000);
    expect(suggestions.every((suggestion) => suggestion.status === 'EXACT')).toBe(true);
  },
);
