/** Nombres de colas BullMQ. Cada fase agrega la suya (importación, motor, informes). */
export const QUEUES = { system: 'system', imports: 'imports' } as const;

/** Trabajo de importación: siempre lleva la organización (aislamiento también en el worker). */
export type ImportJob = {
  importId: string;
  organizationId: string;
  userId: string;
  correlationId: string;
};
