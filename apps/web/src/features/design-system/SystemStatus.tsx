import { useQuery } from '@tanstack/react-query';
import { HealthResponse } from '@finagent/contracts';
import { CheckCircle2, XCircle } from 'lucide-react';
import { ErrorState, LoadingState } from '@/components/States';

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

/** Estado de la API y su infraestructura (verificación de la Fase 1). */
export function SystemStatus() {
  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ['health'],
    queryFn: fetchHealth,
  });

  if (isPending) return <LoadingState rows={3} label="Consultando estado del sistema…" />;
  if (isError)
    return <ErrorState message="No se pudo contactar la API." onRetry={() => refetch()} />;

  return (
    <ul className="space-y-2 text-sm">
      {Object.entries(LABELS).map(([key, label]) => {
        const up = data.checks[key as keyof typeof LABELS] === 'up';
        return (
          <li key={key} className="flex items-center justify-between">
            <span>{label}</span>
            <span
              className={`inline-flex items-center gap-1 ${up ? 'text-success-text' : 'text-danger-text'}`}
            >
              {up ? (
                <CheckCircle2 aria-hidden className="size-4" />
              ) : (
                <XCircle aria-hidden className="size-4" />
              )}
              {up ? 'Operativo' : 'Caído'}
            </span>
          </li>
        );
      })}
      <li className="pt-1 text-xs text-muted-foreground">API versión {data.version}</li>
    </ul>
  );
}
