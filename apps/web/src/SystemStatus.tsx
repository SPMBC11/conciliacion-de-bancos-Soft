import { useQuery } from '@tanstack/react-query';
import { HealthResponse } from '@finagent/contracts';

const LABELS = {
  database: 'Base de datos',
  redis: 'Colas (Redis)',
  storage: 'Almacenamiento',
} as const;

async function fetchHealth(): Promise<HealthResponse> {
  const res = await fetch('/api/health');
  // 503 también trae el detalle de cada servicio.
  return HealthResponse.parse(await res.json());
}

/** Página temporal de la Fase 1: confirma que frontend, API e infraestructura se comunican. */
export function SystemStatus() {
  const { data, isPending, isError } = useQuery({ queryKey: ['health'], queryFn: fetchHealth });

  return (
    <main className="mx-auto max-w-md p-6">
      <h1 className="text-2xl font-semibold">FinAgent AI</h1>
      <p className="mt-1 text-text-muted">Estado del sistema</p>
      <section className="mt-6 rounded-xl border border-border bg-surface p-4">
        {isPending && <p>Consultando…</p>}
        {isError && <p className="text-danger">✕ No se pudo contactar la API.</p>}
        {data && (
          <ul className="space-y-2">
            {Object.entries(LABELS).map(([key, label]) => {
              const up = data.checks[key as keyof typeof LABELS] === 'up';
              return (
                <li key={key} className="flex justify-between">
                  <span>{label}</span>
                  <span className={up ? 'text-success' : 'text-danger'}>
                    {up ? '✓ Operativo' : '✕ Caído'}
                  </span>
                </li>
              );
            })}
            <li className="pt-2 text-sm text-text-muted">Versión {data.version}</li>
          </ul>
        )}
      </section>
    </main>
  );
}
