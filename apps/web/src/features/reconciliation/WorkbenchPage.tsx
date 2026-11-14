import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Hand,
  RotateCcw,
  Search,
  X,
} from 'lucide-react';
import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { useAuth } from '@/auth/auth-provider';
import { ConfirmationDialog } from '@/components/ConfirmationDialog';
import { EmptyState, ErrorState, LoadingState } from '@/components/States';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input, NativeSelect } from '@/components/ui/input';
import { useOrgKey } from '@/features/admin/api';
import { api, errorMessage } from '@/lib/api';
import { formatDate, formatMoney } from '@/lib/format';
import {
  type ConfirmedMatch,
  type Paged,
  type Suggestion,
  type WorkbenchTransaction,
  useConfirmedMatches,
  useMatchingRuns,
  useRunBalanceSummary,
  useSuggestions,
  useWorkbenchTransactions,
} from './api';

export type WorkbenchMode =
  'CENTER' | 'SUMMARY' | 'PENDING' | 'DIFFERENCES' | 'UNMATCHED' | 'DUPLICATES' | 'MATCHES';

const MODE_COPY: Record<WorkbenchMode, { title: string; description: string }> = {
  CENTER: {
    title: 'Centro de conciliación',
    description: 'Revise propuestas deterministas, compare ambos libros y registre sus decisiones.',
  },
  SUMMARY: {
    title: 'Resumen de conciliaciones',
    description: 'Estado de las ejecuciones y de los movimientos del periodo seleccionado.',
  },
  PENDING: { title: 'Pendientes', description: 'Propuestas que todavía esperan decisión humana.' },
  DIFFERENCES: {
    title: 'Diferencias',
    description: 'Propuestas con diferencia de importe o fecha que requieren motivo.',
  },
  UNMATCHED: {
    title: 'Sin identificar',
    description: 'Movimientos sin contraparte y partidas arrastradas de periodos anteriores.',
  },
  DUPLICATES: {
    title: 'Posibles duplicados',
    description: 'Movimientos conservados que requieren decisión sobre su duplicidad.',
  },
  MATCHES: {
    title: 'Coincidencias confirmadas',
    description: 'Asociaciones humanas con opción de reversión auditada.',
  },
};

type DialogAction =
  | { kind: 'confirm'; suggestionId: string }
  | { kind: 'reject'; suggestionId: string }
  | { kind: 'review'; suggestionId: string }
  | { kind: 'manual' }
  | { kind: 'reverse'; matchId: string };

export function WorkbenchPage({ mode = 'CENTER' }: { mode?: WorkbenchMode }) {
  const { can } = useAuth();
  const [params, setParams] = useSearchParams();
  const runs = useMatchingRuns();
  const runId = params.get('runId') ?? undefined;
  const run = runs.data?.find((item) => item.id === runId) ?? runs.data?.[0];
  useEffect(() => {
    if (!runId && run) setParams({ runId: run.id }, { replace: true });
  }, [runId, run, setParams]);

  const [page, setPage] = useState(1);
  const [bankPage, setBankPage] = useState(1);
  const [bookPage, setBookPage] = useState(1);
  const [bankSearch, setBankSearch] = useState('');
  const [bookSearch, setBookSearch] = useState('');
  const deferredBankSearch = useDeferredValue(bankSearch);
  const deferredBookSearch = useDeferredValue(bookSearch);
  const [selectedBank, setSelectedBank] = useState<Set<string>>(() => new Set());
  const [selectedBook, setSelectedBook] = useState<Set<string>>(() => new Set());
  const [dialog, setDialog] = useState<DialogAction | null>(null);
  const copy = MODE_COPY[mode];
  const needsOpen = ['CENTER', 'PENDING'].includes(mode);
  const resultGroup =
    mode === 'DIFFERENCES'
      ? 'DIFFERENCES'
      : mode === 'UNMATCHED'
        ? 'UNMATCHED'
        : mode === 'DUPLICATES'
          ? 'DUPLICATES'
          : undefined;

  const runKey = useOrgKey('matching-run', run?.id);
  const queryClient = useQueryClient();
  const suggestions = useSuggestions(run?.id, page, needsOpen ? 'OPEN' : undefined, resultGroup);
  const balances = useRunBalanceSummary(run?.id);
  const matches = useConfirmedMatches(mode === 'MATCHES' ? run?.id : undefined);
  const bank = useWorkbenchTransactions(run?.id, 'BANK', bankPage, deferredBankSearch || undefined);
  const book = useWorkbenchTransactions(run?.id, 'BOOK', bookPage, deferredBookSearch || undefined);
  const suggestionsKey = useOrgKey('matching-suggestions');
  const transactionKey = useOrgKey('workbench-transactions');
  const matchKey = useOrgKey('confirmed-matches');
  const summaryKey = useOrgKey('matching-run-summary');

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: runKey }),
      queryClient.invalidateQueries({ queryKey: suggestionsKey }),
      queryClient.invalidateQueries({ queryKey: transactionKey }),
      queryClient.invalidateQueries({ queryKey: matchKey }),
      queryClient.invalidateQueries({ queryKey: summaryKey }),
    ]);
    setSelectedBank(new Set());
    setSelectedBook(new Set());
  };

  const action = useMutation({
    mutationFn: async (input: { dialog: DialogAction; reason: string }) => {
      const { dialog: selectedAction, reason: note } = input;
      if (selectedAction.kind === 'confirm')
        return api(`/api/reconciliations/suggestions/${selectedAction.suggestionId}/confirm`, {
          method: 'POST',
          body: { reason: note },
        });
      if (selectedAction.kind === 'reject')
        return api(`/api/reconciliations/suggestions/${selectedAction.suggestionId}/reject`, {
          method: 'POST',
          body: { reason: note },
        });
      if (selectedAction.kind === 'review')
        return api(
          `/api/reconciliations/suggestions/${selectedAction.suggestionId}/request-review`,
          { method: 'POST', body: { reason: note } },
        );
      if (selectedAction.kind === 'reverse')
        return api(`/api/reconciliations/matches/${selectedAction.matchId}/reverse`, {
          method: 'POST',
          body: { reason: note },
        });
      if (!run) throw new Error('Seleccione una ejecución.');
      return api('/api/reconciliations/matches/manual', {
        method: 'POST',
        body: {
          runId: run.id,
          bankTransactionIds: [...selectedBank],
          accountingTransactionIds: [...selectedBook],
          reason: note,
        },
      });
    },
    onSuccess: async () => {
      toast.success('Decisión registrada y auditada');
      setDialog(null);
      await refresh();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  if (runs.isPending) return <LoadingState rows={5} />;
  if (runs.isError)
    return <ErrorState message={errorMessage(runs.error)} onRetry={() => runs.refetch()} />;
  if (!run)
    return (
      <EmptyState
        title="Todavía no hay ejecuciones"
        description="Inicie una conciliación para revisar movimientos importados."
      />
    );

  const onRunChange = (id: string) => {
    setParams({ runId: id });
    setPage(1);
    setBankPage(1);
    setBookPage(1);
    setSelectedBank(new Set());
    setSelectedBook(new Set());
  };
  const suggestionsData = suggestions.data?.data ?? [];
  const totalPages = Math.max(1, Math.ceil((suggestions.data?.total ?? 0) / 50));
  const selectedCount = selectedBank.size + selectedBook.size;

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{copy.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{copy.description}</p>
        </div>
        <label className="space-y-1 text-sm font-medium">
          Ejecución
          <NativeSelect
            aria-label="Ejecución"
            value={run.id}
            onChange={(e) => onRunChange(e.target.value)}
          >
            {runs.data?.map((item) => (
              <option key={item.id} value={item.id}>
                {item.bankAccount.bank.name} · {item.bankAccount.name} · {item.period.month}/
                {item.period.year} · v{item.ruleVersion.version}
              </option>
            ))}
          </NativeSelect>
        </label>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          title="Movimientos bancarios"
          value={balances.data?.bank.movementCount.toLocaleString('es-CO') ?? '—'}
          sub={balances.data ? formatMoney(balances.data.bank.movementNet) : 'Cargando saldo'}
        />
        <SummaryCard
          title="Movimientos contables"
          value={balances.data?.book.movementCount.toLocaleString('es-CO') ?? '—'}
          sub={balances.data ? formatMoney(balances.data.book.movementNet) : 'Cargando saldo'}
        />
        <SummaryCard
          title="Pendientes"
          value={
            balances.data
              ? (
                  balances.data.bank.pendingMovementCount + balances.data.book.pendingMovementCount
                ).toLocaleString('es-CO')
              : '—'
          }
          sub={balances.data ? formatMoney(balances.data.pendingDifference) : 'Sin datos'}
        />
        <SummaryCard
          title="Diferencia neta"
          value={balances.data ? formatMoney(balances.data.movementDifference) : '—'}
          sub={
            balances.data?.movementDifference === '0.00'
              ? 'Los movimientos suman cero'
              : 'Banco más libro'
          }
        />
      </div>

      {balances.isError && (
        <ErrorState message={errorMessage(balances.error)} onRetry={() => balances.refetch()} />
      )}

      {mode === 'SUMMARY' ? (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Ejecuciones recientes</h2>
          <div className="grid gap-3 md:grid-cols-2">
            {runs.data?.map((item) => (
              <Card key={item.id}>
                <CardContent className="space-y-2 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-medium">
                        {item.bankAccount.bank.name} · {item.bankAccount.name}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {item.period.month}/{item.period.year} · Reglas v{item.ruleVersion.version}
                      </p>
                    </div>
                    <span className="rounded-full bg-success/10 px-2 py-1 text-xs text-success-text">
                      {item.status === 'COMPLETED' ? 'Completada' : 'Error'}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {item.bankTransactionCount.toLocaleString('es-CO')} bancarios ·{' '}
                    {item.bookTransactionCount.toLocaleString('es-CO')} contables ·{' '}
                    {item.suggestionCount.toLocaleString('es-CO')} resultados
                  </p>
                  <Link
                    to={`/reconciliations/center?runId=${item.id}`}
                    className="inline-flex text-sm font-medium text-primary hover:underline"
                  >
                    Abrir mesa de trabajo
                  </Link>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      ) : mode === 'MATCHES' ? (
        <ConfirmedMatches
          matches={matches.data ?? []}
          isLoading={matches.isPending}
          onReverse={(id) => setDialog({ kind: 'reverse', matchId: id })}
          canEdit={can('reconciliations.prepare')}
        />
      ) : (
        <section className="space-y-3" aria-label="Propuestas de conciliación">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">
              Propuestas{' '}
              {suggestions.data ? `(${suggestions.data.total.toLocaleString('es-CO')})` : ''}
            </h2>
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                <ChevronLeft aria-hidden /> Anterior
              </Button>
              <span className="text-xs tabular text-muted-foreground">
                {page} / {totalPages}
              </span>
              <Button
                variant="secondary"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Siguiente <ChevronRight aria-hidden />
              </Button>
            </div>
          </div>
          {suggestions.isPending ? (
            <LoadingState rows={4} />
          ) : suggestions.isError ? (
            <ErrorState
              message={errorMessage(suggestions.error)}
              onRetry={() => suggestions.refetch()}
            />
          ) : suggestionsData.length === 0 ? (
            <EmptyState
              title="Sin propuestas para este filtro"
              description="Los movimientos pueden estar conciliados o todavía no se han importado."
            />
          ) : (
            <div className="grid gap-3">
              {suggestionsData.map((suggestion) => (
                <SuggestionCard
                  key={suggestion.id}
                  suggestion={suggestion}
                  canEdit={can('reconciliations.prepare')}
                  onConfirm={() => setDialog({ kind: 'confirm', suggestionId: suggestion.id })}
                  onReject={() => setDialog({ kind: 'reject', suggestionId: suggestion.id })}
                  onReview={() => setDialog({ kind: 'review', suggestionId: suggestion.id })}
                />
              ))}
            </div>
          )}
        </section>
      )}

      {!['SUMMARY', 'MATCHES'].includes(mode) && (
        <section className="space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold">Asociación manual</h2>
              <p className="text-sm text-muted-foreground">
                Seleccione uno o varios movimientos de cada lado. El total se comprueba en el
                servidor.
              </p>
            </div>
            <Button
              disabled={
                !can('reconciliations.prepare') ||
                !selectedBank.size ||
                !selectedBook.size ||
                action.isPending
              }
              onClick={() => setDialog({ kind: 'manual' })}
            >
              <Hand aria-hidden /> Asociar {selectedCount || ''}
            </Button>
          </div>
          <div className="grid min-w-0 gap-4 xl:grid-cols-2">
            <TransactionPanel
              title="Extracto bancario"
              side="BANK"
              result={bank.data}
              isLoading={bank.isPending}
              error={bank.isError ? errorMessage(bank.error) : null}
              page={bankPage}
              onPage={setBankPage}
              search={bankSearch}
              onSearch={setBankSearch}
              selected={selectedBank}
              onToggle={toggleSelection(setSelectedBank)}
              onRetry={() => bank.refetch()}
            />
            <TransactionPanel
              title="Auxiliar contable"
              side="BOOK"
              result={book.data}
              isLoading={book.isPending}
              error={book.isError ? errorMessage(book.error) : null}
              page={bookPage}
              onPage={setBookPage}
              search={bookSearch}
              onSearch={setBookSearch}
              selected={selectedBook}
              onToggle={toggleSelection(setSelectedBook)}
              onRetry={() => book.refetch()}
            />
          </div>
        </section>
      )}

      <ConfirmationDialog
        open={Boolean(dialog)}
        onOpenChange={(open) => {
          if (!open) setDialog(null);
        }}
        title={dialogTitle(dialog)}
        description={dialogDescription(dialog)}
        confirmLabel={dialogConfirmLabel(dialog)}
        requireReason
        onConfirm={(note) => dialog && action.mutate({ dialog, reason: note ?? '' })}
        tone={dialog?.kind === 'reject' || dialog?.kind === 'reverse' ? 'danger' : 'primary'}
      />
    </div>
  );
}

function dialogTitle(action: DialogAction | null) {
  if (action?.kind === 'confirm') return 'Confirmar propuesta';
  if (action?.kind === 'reject') return 'Rechazar propuesta';
  if (action?.kind === 'review') return 'Solicitar revisión';
  if (action?.kind === 'reverse') return 'Deshacer conciliación';
  return 'Asociar movimientos';
}
function dialogDescription(action: DialogAction | null) {
  if (action?.kind === 'confirm')
    return 'Confirme que verificó la relación entre los movimientos. El motivo quedará en auditoría.';
  if (action?.kind === 'reject')
    return 'La propuesta quedará rechazada, sin cambiar los movimientos originales.';
  if (action?.kind === 'review') return 'La propuesta quedará marcada para revisión adicional.';
  if (action?.kind === 'reverse')
    return 'La asociación se revertirá y los movimientos quedarán disponibles otra vez.';
  return 'La suma se valida en el servidor. Si los importes difieren, explique la justificación.';
}
function dialogConfirmLabel(action: DialogAction | null) {
  return action?.kind === 'confirm'
    ? 'Confirmar'
    : action?.kind === 'reject'
      ? 'Rechazar'
      : action?.kind === 'review'
        ? 'Solicitar revisión'
        : action?.kind === 'reverse'
          ? 'Deshacer'
          : 'Asociar';
}

function toggleSelection(setter: (update: (value: Set<string>) => Set<string>) => void) {
  return (id: string) =>
    setter((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
}

function SummaryCard({
  title,
  value,
  sub,
}: {
  title: string;
  value: string | number;
  sub: string;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-sm text-muted-foreground">{title}</p>
        <p className="mt-1 text-xl font-semibold tabular">{value}</p>
        <p className="mt-1 truncate text-xs text-muted-foreground">{sub}</p>
      </CardContent>
    </Card>
  );
}

function SuggestionCard({
  suggestion,
  canEdit,
  onConfirm,
  onReject,
  onReview,
}: {
  suggestion: Suggestion;
  canEdit: boolean;
  onConfirm: () => void;
  onReject: () => void;
  onReview: () => void;
}) {
  const statusLabel: Record<string, string> = {
    EXACT: 'Coincidencia exacta',
    PROBABLE: 'Coincidencia probable',
    AMBIGUOUS: 'Ambigua',
    AMOUNT_DIFFERENCE: 'Diferencia de importe',
    DATE_DIFFERENCE: 'Diferencia de fecha',
    BANK_UNMATCHED: 'Sin movimiento contable',
    BOOK_UNMATCHED: 'Sin movimiento bancario',
    POSSIBLE_DUPLICATE: 'Posible duplicado',
    BANK_FEE: `Nota bancaria · ${suggestion.feeType ?? ''}`,
    CARRIED_FORWARD: 'Arrastre de periodo anterior',
  };
  const mayConfirm = ['EXACT', 'PROBABLE', 'AMOUNT_DIFFERENCE', 'DATE_DIFFERENCE'].includes(
    suggestion.status,
  );
  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
              {statusLabel[suggestion.status] ?? suggestion.status}
            </span>
            <span className="rounded-full bg-surface-secondary px-2.5 py-1 text-xs text-muted-foreground">
              {suggestion.reviewStatus === 'OPEN' ? 'Pendiente' : suggestion.reviewStatus}
            </span>
            <span className="text-xs text-muted-foreground">
              Regla {suggestion.rule} · {suggestion.score}/100
            </span>
          </div>
          <div className="text-sm font-semibold tabular">
            Diferencia {formatMoney(suggestion.amountDifference)}
          </div>
        </div>
        <p className="text-sm text-muted-foreground">{suggestion.explanation}</p>
        <div className="grid gap-2 md:grid-cols-2">
          <TransactionDetails label="Banco" transactions={suggestion.bankTransactions} />
          <TransactionDetails label="Libro" transactions={suggestion.accountingTransactions} />
        </div>
        {canEdit && suggestion.reviewStatus === 'OPEN' && (
          <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-3">
            <Button variant="secondary" size="sm" onClick={onReview}>
              <CircleAlert aria-hidden /> Revisar
            </Button>
            <Button variant="danger" size="sm" onClick={onReject}>
              <X aria-hidden /> Rechazar
            </Button>
            {mayConfirm && (
              <Button size="sm" onClick={onConfirm}>
                <Check aria-hidden /> Confirmar
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function TransactionDetails({
  label,
  transactions,
}: {
  label: string;
  transactions: WorkbenchTransaction[];
}) {
  return (
    <div className="rounded-lg border border-border bg-surface-secondary/40 p-3">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label} · {transactions.length}
      </p>
      {transactions.length ? (
        <ul className="space-y-2">
          {transactions.map((tx) => (
            <li key={tx.id} className="flex items-start justify-between gap-3 text-sm">
              <span className="min-w-0">
                <span className="block truncate font-medium">{tx.description}</span>
                <span className="text-xs text-muted-foreground">
                  {formatDate(tx.operationDate)}
                  {tx.reference ? ` · ${tx.reference}` : ''}
                </span>
              </span>
              <span className="shrink-0 tabular">
                {formatMoney(tx.amount, tx.currency as 'COP' | 'USD')}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">Sin movimiento en este lado.</p>
      )}
    </div>
  );
}

function TransactionPanel({
  title,
  side,
  result,
  isLoading,
  error,
  page,
  onPage,
  search,
  onSearch,
  selected,
  onToggle,
  onRetry,
}: {
  title: string;
  side: 'BANK' | 'BOOK';
  result: Paged<WorkbenchTransaction> | undefined;
  isLoading: boolean;
  error: string | null;
  page: number;
  onPage: (page: number) => void;
  search: string;
  onSearch: (value: string) => void;
  selected: Set<string>;
  onToggle: (id: string) => void;
  onRetry: () => void;
}) {
  const rows = result?.data ?? [];
  const totalPages = Math.max(1, Math.ceil((result?.total ?? 0) / 100));
  return (
    <Card className="min-w-0 overflow-hidden">
      <CardHeader>
        <div className="min-w-0">
          <CardTitle>{title}</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            {result?.total.toLocaleString('es-CO') ?? '—'}{' '}
            {side === 'BANK' ? 'movimientos bancarios' : 'movimientos contables'} pendientes
          </p>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 p-3 sm:p-5">
        <label className="relative block">
          <Search aria-hidden className="absolute top-2.5 left-3 size-4 text-muted-foreground" />
          <Input
            aria-label={`Buscar ${title}`}
            className="pl-9"
            placeholder="Buscar descripción o referencia"
            value={search}
            onChange={(e) => {
              onSearch(e.target.value);
              onPage(1);
            }}
          />
        </label>
        {isLoading ? (
          <LoadingState rows={5} />
        ) : error ? (
          <ErrorState message={error} onRetry={onRetry} />
        ) : rows.length === 0 ? (
          <EmptyState
            title="Sin movimientos pendientes"
            description="Los resultados aparecen cuando existen partidas importadas sin conciliar."
          />
        ) : (
          <div
            role="table"
            aria-label={title}
            aria-rowcount={result?.total}
            className="rounded-lg border border-border"
          >
            <VirtualTransactionRows rows={rows} selected={selected} onToggle={onToggle} />
          </div>
        )}
        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>{selected.size} seleccionados</span>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              disabled={page <= 1}
              aria-label={`Página anterior ${title}`}
              onClick={() => onPage(page - 1)}
            >
              <ChevronLeft aria-hidden />
            </Button>
            <span>
              {page}/{totalPages}
            </span>
            <Button
              variant="ghost"
              size="sm"
              disabled={page >= totalPages}
              aria-label={`Página siguiente ${title}`}
              onClick={() => onPage(page + 1)}
            >
              <ChevronRight aria-hidden />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function VirtualTransactionRows({
  rows,
  selected,
  onToggle,
}: {
  rows: WorkbenchTransaction[];
  selected: Set<string>;
  onToggle: (id: string) => void;
}) {
  const rowHeight = 72;
  const visible = 8;
  const [start, setStart] = useState(0);
  const end = Math.min(rows.length, start + visible + 4);
  const rendered = rows.slice(start, end);
  return (
    <div
      className="h-[430px] overflow-auto"
      onScroll={(e) =>
        setStart(Math.max(0, Math.floor((e.currentTarget.scrollTop - 36) / rowHeight) - 2))
      }
    >
      <div
        role="rowgroup"
        className="sticky top-0 z-10 grid h-9 grid-cols-[2rem_1fr_auto] gap-2 border-b border-border bg-surface-secondary px-3 py-2 text-xs font-semibold text-muted-foreground"
      >
        <span></span>
        <span>Movimiento · fecha · referencia</span>
        <span className="text-right">Importe</span>
      </div>
      <div role="rowgroup" className="relative">
        <div style={{ height: rows.length * rowHeight, position: 'relative' }}>
          <div
            className="absolute inset-x-0 top-0"
            style={{ transform: `translateY(${start * rowHeight}px)` }}
          >
            {rendered.map((tx, index) => (
              <div
                role="row"
                key={tx.id}
                aria-rowindex={start + index + 2}
                className="grid h-[72px] grid-cols-[2rem_1fr_auto] items-center gap-2 border-b border-border px-3 text-sm"
              >
                <input
                  type="checkbox"
                  aria-label={`Seleccionar movimiento ${tx.operationDate} ${tx.description}`}
                  checked={selected.has(tx.id)}
                  onChange={() => onToggle(tx.id)}
                />
                <span className="min-w-0">
                  <span className="block truncate font-medium">{tx.description}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {formatDate(tx.operationDate)}
                    {tx.reference ? ` · ${tx.reference}` : ''}
                    {tx.carryover ? ' · Arrastre' : ''}
                  </span>
                </span>
                <span className="text-right tabular">
                  {formatMoney(tx.amount, tx.currency as 'COP' | 'USD')}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function ConfirmedMatches({
  matches,
  isLoading,
  onReverse,
  canEdit,
}: {
  matches: ConfirmedMatch[];
  isLoading: boolean;
  onReverse: (id: string) => void;
  canEdit: boolean;
}) {
  const active = useMemo(() => matches.filter((match) => match.status === 'CONFIRMED'), [matches]);
  if (isLoading) return <LoadingState rows={4} />;
  if (!active.length)
    return (
      <EmptyState
        title="Sin coincidencias confirmadas"
        description="Las asociaciones aprobadas aparecerán aquí."
      />
    );
  return (
    <div className="grid gap-3">
      {active.map((match) => (
        <Card key={match.id}>
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div>
              <p className="font-medium">
                {match.items.filter((item) => item.side === 'BANK').length} movimiento(s)
                bancario(s) ↔ {match.items.filter((item) => item.side === 'BOOK').length}{' '}
                contable(s)
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {match.suggestion.explanation} ·{' '}
                {new Date(match.confirmedAt).toLocaleString('es-CO')}
              </p>
            </div>
            {canEdit && (
              <Button variant="secondary" onClick={() => onReverse(match.id)}>
                <RotateCcw aria-hidden /> Deshacer
              </Button>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
