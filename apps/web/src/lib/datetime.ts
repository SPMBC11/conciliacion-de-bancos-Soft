const dateTime = new Intl.DateTimeFormat('es-CO', {
  timeZone: 'America/Bogota',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** Marca de tiempo ISO → "13/11/2026, 18:45" en hora de Bogotá. */
export function formatDateTime(iso: string | null | undefined) {
  return iso ? dateTime.format(new Date(iso)) : '—';
}
