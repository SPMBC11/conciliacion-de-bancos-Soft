import { addDays, BusinessCalendar, type IsoDate } from './calendar.js';

/** Canonical transaction consumed by the deterministic matching engine. Amounts are signed integer cents. */
export type MatchTransaction = {
  id: string;
  side: 'BANK' | 'BOOK';
  date: IsoDate;
  amountCents: bigint;
  currency: string;
  reference?: string | null;
  externalId?: string | null;
  documentNumber?: string | null;
  description: string;
  duplicateStatus?: 'NONE' | 'POSSIBLE' | 'CONFIRMED' | 'DISMISSED';
  carryover?: boolean;
};

export type MatchStatus =
  | 'EXACT'
  | 'PROBABLE'
  | 'AMBIGUOUS'
  | 'AMOUNT_DIFFERENCE'
  | 'DATE_DIFFERENCE'
  | 'BANK_UNMATCHED'
  | 'BOOK_UNMATCHED'
  | 'POSSIBLE_DUPLICATE'
  | 'BANK_FEE'
  | 'CARRIED_FORWARD';

export type MatchRule =
  'EXACT' | 'BUSINESS_DATE' | 'GROUP_SUM' | 'APPROXIMATE' | 'FEE_CLASSIFICATION';

export type MatchSuggestion = {
  bankTransactionIds: string[];
  bookTransactionIds: string[];
  rule: MatchRule;
  status: MatchStatus;
  score: number;
  amountDifferenceCents: bigint;
  dateDifferenceBusinessDays: number;
  explanation: string;
  feeType?: string;
};

export type MatchingOptions = {
  dateToleranceBusinessDays?: number;
  amountToleranceCents?: bigint;
  amountToleranceBasisPoints?: number;
  maxGroupSize?: number;
  holidays?: IsoDate[];
  periodStart?: IsoDate;
};

const normalize = (value: string | null | undefined) =>
  (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');

const reference = (t: MatchTransaction) =>
  normalize(t.externalId || t.reference || t.documentNumber);
const absolute = (n: bigint) => (n < 0n ? -n : n);
const sameReference = (a: MatchTransaction, b: MatchTransaction) => {
  const x = reference(a);
  const y = reference(b);
  return Boolean(
    x && y && (x === y || (Math.min(x.length, y.length) >= 5 && (x.includes(y) || y.includes(x)))),
  );
};

/** Integer token overlap, 0..100. Text similarity is evidence only; it never changes money. */
const textScore = (a: string, b: string) => {
  const left = new Set(
    normalize(a)
      .split(' ')
      .filter((x) => x.length > 2),
  );
  const right = new Set(
    normalize(b)
      .split(' ')
      .filter((x) => x.length > 2),
  );
  if (!left.size || !right.size) return 0;
  let common = 0;
  for (const token of left) if (right.has(token)) common++;
  return Math.floor((200 * common) / (left.size + right.size));
};

const feeType = (description: string): string | undefined => {
  const text = normalize(description);
  if (/\b(GMF|4X1000|GRAVAMEN MOVIMIENTOS FINANCIEROS)\b/.test(text)) return 'GMF';
  if (/\b(IVA|IMPUESTO AL VALOR AGREGADO)\b/.test(text) && /COMISION|CUOTA|MANEJO/.test(text))
    return 'VAT_ON_FEE';
  if (/\b(COMISION|COMISIONES|CUOTA DE MANEJO|MANEJO)\b/.test(text)) return 'BANK_FEE';
  if (/\b(RETENCION|RETEFUENTE)\b/.test(text)) return 'WITHHOLDING';
  if (/\b(INTERES|RENDIMIENTO)\b/.test(text)) return 'INTEREST';
  if (/\b(CHEQUERA|CHEQUE)\b/.test(text)) return 'CHECKBOOK';
  return undefined;
};

const make = (
  banks: MatchTransaction[],
  books: MatchTransaction[],
  rule: MatchRule,
  status: MatchStatus,
  score: number,
  dateDiff: number,
  explanation: string,
  calendar: BusinessCalendar,
  fee?: string,
): MatchSuggestion => ({
  bankTransactionIds: banks.map((t) => t.id),
  bookTransactionIds: books.map((t) => t.id),
  rule,
  status,
  score,
  amountDifferenceCents:
    banks.reduce((n, t) => n + t.amountCents, 0n) + books.reduce((n, t) => n + t.amountCents, 0n),
  dateDifferenceBusinessDays:
    banks.length && books.length
      ? Math.max(
          ...banks.map((b) =>
            Math.min(...books.map((k) => calendar.businessDaysBetween(b.date, k.date))),
          ),
        )
      : dateDiff,
  explanation,
  ...(fee && { feeType: fee }),
});

/**
 * Reproducible matcher. Amounts and subset sums stay bigint cents. Only unambiguous exact suggestions are marked EXACT;
 * all tolerance and grouped proposals remain for human review.
 */
export function suggestMatches(
  transactions: MatchTransaction[],
  options: MatchingOptions = {},
): MatchSuggestion[] {
  const dateTolerance = options.dateToleranceBusinessDays ?? 3;
  const maxGroup = Math.max(2, Math.min(options.maxGroupSize ?? 6, 8));
  const amountTolerance = options.amountToleranceCents ?? 100_000n;
  const toleranceBps = BigInt(options.amountToleranceBasisPoints ?? 10);
  const years = transactions.map((t) => Number(t.date.slice(0, 4))).filter(Number.isFinite);
  const yearBounds = years.reduce<[number, number] | null>(
    (bounds, year) =>
      bounds ? [Math.min(bounds[0], year), Math.max(bounds[1], year)] : [year, year],
    null,
  );
  const calendar = BusinessCalendar.forYears(yearBounds ?? [], options.holidays);

  const bank = transactions.filter((t) => t.side === 'BANK');
  const book = transactions.filter((t) => t.side === 'BOOK');
  const oppositeAmount = new Map<string, MatchTransaction[]>();
  const bookByCurrencySign = new Map<string, MatchTransaction[]>();
  const bankByCurrencySign = new Map<string, MatchTransaction[]>();
  const bookByCurrencySignAmount = new Map<string, MatchTransaction[]>();
  const bookByReference = new Map<string, MatchTransaction[]>();
  const bankByReference = new Map<string, MatchTransaction[]>();
  const push = (map: Map<string, MatchTransaction[]>, key: string, value: MatchTransaction) => {
    const rows = map.get(key);
    if (rows) rows.push(value);
    else map.set(key, [value]);
  };
  for (const t of book) {
    const exactKey = `${t.currency}:${t.amountCents.toString()}`;
    push(oppositeAmount, exactKey, t);
    const signKey = `${t.currency}:${t.amountCents < 0n ? '-' : '+'}`;
    push(bookByCurrencySign, signKey, t);
    push(bookByCurrencySignAmount, signKey, t);
    if (reference(t)) push(bookByReference, `${signKey}:${reference(t)}`, t);
  }
  for (const t of bank) {
    const signKey = `${t.currency}:${t.amountCents < 0n ? '-' : '+'}`;
    push(bankByCurrencySign, signKey, t);
    if (reference(t)) push(bankByReference, `${signKey}:${reference(t)}`, t);
  }
  for (const list of [...bookByCurrencySign.values(), ...bankByCurrencySign.values()])
    list.sort((a, b) => a.date.localeCompare(b.date));
  for (const list of bookByCurrencySignAmount.values())
    list.sort((a, b) =>
      a.amountCents < b.amountCents ? -1 : a.amountCents > b.amountCents ? 1 : 0,
    );
  for (const list of [...bookByReference.values(), ...bankByReference.values()])
    list.sort((a, b) => a.date.localeCompare(b.date));
  const usedBank = new Set<string>();
  const usedBook = new Set<string>();
  const suggestions: MatchSuggestion[] = [];
  const add = (s: MatchSuggestion) => {
    suggestions.push(s);
    s.bankTransactionIds.forEach((id) => usedBank.add(id));
    s.bookTransactionIds.forEach((id) => usedBook.add(id));
  };
  const eligible = (t: MatchTransaction) => t.duplicateStatus !== 'CONFIRMED';
  const candidatesFor = (b: MatchTransaction) =>
    (oppositeAmount.get(`${b.currency}:${(-b.amountCents).toString()}`) ?? []).filter(eligible);

  // Rule 1: exact amount, currency and reference, or same amount/date/description.
  const exactCandidates = new Map<string, MatchTransaction[]>();
  const exactReverseCount = new Map<string, number>();
  for (const b of bank.filter(eligible)) {
    const exact = candidatesFor(b).filter(
      (k) =>
        b.date === k.date && (sameReference(b, k) || textScore(b.description, k.description) >= 70),
    );
    exactCandidates.set(b.id, exact);
    exact.forEach((k) => exactReverseCount.set(k.id, (exactReverseCount.get(k.id) ?? 0) + 1));
  }
  for (const b of bank.filter(eligible)) {
    if (usedBank.has(b.id)) continue;
    const exact = exactCandidates.get(b.id) ?? [];
    if (exact.length === 1 && exactReverseCount.get(exact[0]!.id) === 1) {
      add(
        make(
          [b],
          [exact[0]!],
          'EXACT',
          'EXACT',
          100,
          0,
          'Importe, moneda y referencia o fecha/concepto coinciden exactamente.',
          calendar,
        ),
      );
    } else if (exact.length) {
      add(
        make(
          [b],
          exact,
          'EXACT',
          'AMBIGUOUS',
          70,
          0,
          'La coincidencia exacta no es única en ambos lados; requiere selección humana.',
          calendar,
        ),
      );
    }
  }

  // Rule 2: exact amount and matching reference within Colombian business-day tolerance.
  const dateCandidates = new Map<string, MatchTransaction[]>();
  const dateReverseCount = new Map<string, number>();
  for (const b of bank.filter(eligible)) {
    if (usedBank.has(b.id)) continue;
    const candidates = candidatesFor(b).filter(
      (k) =>
        !usedBook.has(k.id) &&
        sameReference(b, k) &&
        calendar.businessDaysBetween(b.date, k.date) <= dateTolerance,
    );
    dateCandidates.set(b.id, candidates);
    candidates.forEach((k) => dateReverseCount.set(k.id, (dateReverseCount.get(k.id) ?? 0) + 1));
  }
  for (const b of bank.filter(eligible)) {
    if (usedBank.has(b.id)) continue;
    const candidates = dateCandidates.get(b.id) ?? [];
    if (candidates.length === 1 && dateReverseCount.get(candidates[0]!.id) === 1) {
      const k = candidates[0]!;
      add(
        make(
          [b],
          [k],
          'BUSINESS_DATE',
          'PROBABLE',
          90,
          0,
          `Importe y referencia coinciden; fecha separada por ${calendar.businessDaysBetween(b.date, k.date)} día(s) hábil(es).`,
          calendar,
        ),
      );
    } else if (candidates.length > 1) {
      add(
        make(
          [b],
          candidates,
          'BUSINESS_DATE',
          'AMBIGUOUS',
          65,
          0,
          'Varias filas comparten importe y referencia dentro de la tolerancia de fecha.',
          calendar,
        ),
      );
    } else if (candidates.length === 1) {
      add(
        make(
          [b],
          candidates,
          'BUSINESS_DATE',
          'AMBIGUOUS',
          65,
          0,
          'El mismo movimiento contable coincide con varios movimientos bancarios; requiere selección humana.',
          calendar,
        ),
      );
    }
  }

  // Same amount/reference outside the allowed calendar window is surfaced as a date discrepancy, never hidden as unmatched.
  for (const b of bank.filter(eligible)) {
    if (usedBank.has(b.id)) continue;
    const candidates = candidatesFor(b).filter(
      (k) =>
        !usedBook.has(k.id) &&
        sameReference(b, k) &&
        calendar.businessDaysBetween(b.date, k.date) > dateTolerance,
    );
    if (candidates.length === 1)
      add(
        make(
          [b],
          [candidates[0]!],
          'BUSINESS_DATE',
          'DATE_DIFFERENCE',
          60,
          0,
          `Importe y referencia coinciden, pero las fechas difieren ${calendar.businessDaysBetween(b.date, candidates[0]!.date)} días hábiles, fuera de la tolerancia configurada.`,
          calendar,
        ),
      );
    else if (candidates.length > 1)
      add(
        make(
          [b],
          candidates,
          'BUSINESS_DATE',
          'AMBIGUOUS',
          45,
          0,
          'Hay varias coincidencias con importe y referencia, pero sus fechas exceden la tolerancia. Requiere revisión.',
          calendar,
        ),
      );
  }

  // Rule 3: bounded 1:N / N:1 exact sums. Candidate count and search nodes are capped per anchor.
  const subsetFor = (anchor: MatchTransaction) => {
    const sign = anchor.amountCents < 0n ? '+' : '-';
    const source =
      (anchor.side === 'BANK' ? bookByCurrencySign : bankByCurrencySign).get(
        `${anchor.currency}:${sign}`,
      ) ?? [];
    const span = Math.max(4, dateTolerance * 3 + 4);
    const lowerDate = addDays(anchor.date, -span);
    const upperDate = addDays(anchor.date, span);
    let start = 0;
    let end = source.length;
    while (start < end) {
      const middle = (start + end) >>> 1;
      if (source[middle]!.date < lowerDate) start = middle + 1;
      else end = middle;
    }
    const first = start;
    end = source.length;
    while (start < end) {
      const middle = (start + end) >>> 1;
      if (source[middle]!.date <= upperDate) start = middle + 1;
      else end = middle;
    }
    const last = start;
    const nearestSample = (rows: MatchTransaction[]) => {
      let lower = 0;
      let upper = rows.length;
      while (lower < upper) {
        const middle = (lower + upper) >>> 1;
        if (rows[middle]!.date < lowerDate) lower = middle + 1;
        else upper = middle;
      }
      const rangeStart = lower;
      upper = rows.length;
      while (lower < upper) {
        const middle = (lower + upper) >>> 1;
        if (rows[middle]!.date <= upperDate) lower = middle + 1;
        else upper = middle;
      }
      const rangeEnd = lower;
      upper = rangeEnd;
      lower = rangeStart;
      while (lower < upper) {
        const middle = (lower + upper) >>> 1;
        if (rows[middle]!.date < anchor.date) lower = middle + 1;
        else upper = middle;
      }
      const sampleStart = Math.max(rangeStart, Math.min(lower - 14, rangeEnd - 28));
      return rows.slice(sampleStart, Math.min(rangeEnd, sampleStart + 28));
    };
    const refMap = anchor.side === 'BANK' ? bookByReference : bankByReference;
    const refRows = reference(anchor)
      ? (refMap.get(`${anchor.currency}:${sign}:${reference(anchor)}`) ?? [])
      : [];
    let anchorIndex = first;
    let anchorHigh = last;
    while (anchorIndex < anchorHigh) {
      const middle = (anchorIndex + anchorHigh) >>> 1;
      if (source[middle]!.date < anchor.date) anchorIndex = middle + 1;
      else anchorHigh = middle;
    }
    const generalStart = Math.max(first, Math.min(anchorIndex - 14, last - 28));
    const selected = [
      ...source.slice(generalStart, Math.min(last, generalStart + 28)),
      ...nearestSample(refRows),
    ];
    const unique = [...new Map(selected.map((t) => [t.id, t])).values()];
    const candidates = unique
      .filter(
        (t) =>
          !usedBook.has(t.id) &&
          !usedBank.has(t.id) &&
          eligible(t) &&
          calendar.businessDaysBetween(anchor.date, t.date) <= dateTolerance,
      )
      .map((t) => ({
        t,
        rank:
          (sameReference(anchor, t) ? 1000 : 0) +
          textScore(anchor.description, t.description) * 10 -
          calendar.businessDaysBetween(anchor.date, t.date),
      }))
      .sort((a, b) => b.rank - a.rank)
      .slice(0, 28)
      .map((x) => x.t);
    let nodes = 0;
    const found: MatchTransaction[][] = [];
    const walk = (index: number, total: bigint, group: MatchTransaction[]) => {
      if (++nodes > 2_000 || found.length > 1) return;
      if (group.length > 1 && total + anchor.amountCents === 0n) {
        found.push([...group]);
        return;
      }
      if (group.length >= maxGroup || index >= candidates.length) return;
      for (let i = index; i < candidates.length; i++) {
        const candidate = candidates[i]!;
        if (absolute(total + candidate.amountCents) > absolute(anchor.amountCents)) continue;
        group.push(candidate);
        walk(i + 1, total + candidate.amountCents, group);
        group.pop();
        if (found.length > 1 || nodes > 2_000) return;
      }
    };
    walk(0, 0n, []);
    return found;
  };
  const groupCandidates: MatchSuggestion[] = [];
  for (const b of bank.filter(eligible)) {
    if (usedBank.has(b.id)) continue;
    const found = subsetFor(b);
    if (found.length === 1)
      groupCandidates.push(
        make(
          [b],
          found[0]!,
          'GROUP_SUM',
          'PROBABLE',
          85,
          0,
          `La suma exacta de ${found[0]!.length} movimientos contables corresponde al importe bancario.`,
          calendar,
        ),
      );
  }
  for (const k of book.filter(eligible)) {
    if (usedBook.has(k.id)) continue;
    const found = subsetFor(k);
    if (found.length === 1)
      groupCandidates.push(
        make(
          found[0]!,
          [k],
          'GROUP_SUM',
          'PROBABLE',
          85,
          0,
          `La suma exacta de ${found[0]!.length} movimientos bancarios corresponde al importe contable.`,
          calendar,
        ),
      );
  }
  const groupMembership = new Map<string, number>();
  for (const candidate of groupCandidates)
    for (const id of [...candidate.bankTransactionIds, ...candidate.bookTransactionIds])
      groupMembership.set(id, (groupMembership.get(id) ?? 0) + 1);
  for (const candidate of groupCandidates) {
    const ambiguous = [...candidate.bankTransactionIds, ...candidate.bookTransactionIds].some(
      (id) => groupMembership.get(id)! > 1,
    );
    add(
      ambiguous
        ? {
            ...candidate,
            status: 'AMBIGUOUS',
            explanation:
              'El movimiento participa en varias agrupaciones exactas posibles; requiere selección humana.',
          }
        : candidate,
    );
  }

  // Rule 4: bounded amount tolerance; never auto-confirms. For equal references, date and text refine the score.
  for (const b of bank.filter(eligible)) {
    if (usedBank.has(b.id)) continue;
    const relativeLimit = (absolute(b.amountCents) * toleranceBps) / 10_000n;
    const limit = relativeLimit < amountTolerance ? relativeLimit : amountTolerance;
    const target = -b.amountCents;
    const values =
      bookByCurrencySignAmount.get(`${b.currency}:${b.amountCents < 0n ? '+' : '-'}`) ?? [];
    let low = 0;
    let high = values.length;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if (values[middle]!.amountCents < target - limit) low = middle + 1;
      else high = middle;
    }
    const probable = [] as Array<{ t: MatchTransaction; score: number }>;
    for (let i = low; i < values.length && values[i]!.amountCents <= target + limit; i++) {
      const k = values[i]!;
      const difference = absolute(b.amountCents + k.amountCents);
      if (
        usedBook.has(k.id) ||
        !eligible(k) ||
        difference === 0n ||
        calendar.businessDaysBetween(b.date, k.date) > dateTolerance
      )
        continue;
      const score = (sameReference(b, k) ? 50 : 0) + textScore(b.description, k.description);
      if (score >= 30) probable.push({ t: k, score });
    }
    probable.sort((a, b) => b.score - a.score);
    if (probable.length) {
      const top = probable.filter((x) => x.score === probable[0]!.score);
      if (top.length === 1)
        add(
          make(
            [b],
            [top[0]!.t],
            'APPROXIMATE',
            'AMOUNT_DIFFERENCE',
            top[0]!.score,
            0,
            `Diferencia de importe ${absolute(b.amountCents + top[0]!.t.amountCents)} centavos; por debajo de la tolerancia configurada. Requiere aprobación humana.`,
            calendar,
          ),
        );
      else
        add(
          make(
            [b],
            top.map((x) => x.t),
            'APPROXIMATE',
            'AMBIGUOUS',
            top[0]!.score,
            0,
            'Varias coincidencias aproximadas tienen el mismo puntaje; requiere revisión humana.',
            calendar,
          ),
        );
    }
  }

  // Rule 5: classify unmatched bank notes, without creating accounting entries or posting anything.
  for (const b of bank.filter(eligible)) {
    if (usedBank.has(b.id)) continue;
    const type = feeType(b.description);
    if (type)
      add(
        make(
          [b],
          [],
          'FEE_CLASSIFICATION',
          'BANK_FEE',
          60,
          0,
          `Nota bancaria clasificada como ${type}; no se genera asiento contable automáticamente.`,
          calendar,
          type,
        ),
      );
  }

  // Remaining rows are explicit unmatched results; possible duplicates are highlighted and retained.
  for (const b of bank)
    if (!usedBank.has(b.id))
      add(
        make(
          [b],
          [],
          'EXACT',
          b.duplicateStatus === 'POSSIBLE'
            ? 'POSSIBLE_DUPLICATE'
            : b.carryover
              ? 'CARRIED_FORWARD'
              : 'BANK_UNMATCHED',
          0,
          0,
          b.duplicateStatus === 'POSSIBLE'
            ? 'Movimiento marcado como posible duplicado durante la importación.'
            : b.carryover
              ? 'Pendiente de un periodo anterior; se conserva como arrastre.'
              : 'Sin movimiento contable relacionado.',
          calendar,
        ),
      );
  for (const k of book)
    if (!usedBook.has(k.id))
      add(
        make(
          [],
          [k],
          'EXACT',
          k.duplicateStatus === 'POSSIBLE'
            ? 'POSSIBLE_DUPLICATE'
            : k.carryover
              ? 'CARRIED_FORWARD'
              : 'BOOK_UNMATCHED',
          0,
          0,
          k.duplicateStatus === 'POSSIBLE'
            ? 'Movimiento marcado como posible duplicado durante la importación.'
            : k.carryover
              ? 'Pendiente de un periodo anterior; se conserva como arrastre.'
              : 'Sin movimiento bancario relacionado.',
          calendar,
        ),
      );

  return suggestions;
}
