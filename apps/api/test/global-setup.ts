import { execSync } from 'node:child_process';
import pg from 'pg';

const ADMIN_URL = 'postgresql://finagent:finagent_dev@localhost:5432/finagent';
const TEST_DB = 'finagent_test';

/**
 * Base de datos de pruebas aislada. Se crea si no existe y se le aplican las migraciones
 * pendientes (operación no destructiva). Los datos de prueba nunca tocan la base de desarrollo.
 */
export default async function setup() {
  const client = new pg.Client({ connectionString: ADMIN_URL });
  await client.connect();
  const { rowCount } = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [
    TEST_DB,
  ]);
  if (!rowCount) await client.query(`CREATE DATABASE ${TEST_DB}`);
  await client.end();

  execSync('npx prisma migrate deploy', {
    env: { ...process.env, DATABASE_URL: ADMIN_URL.replace(/\/finagent$/, `/${TEST_DB}`) },
    stdio: 'pipe',
  });
}
