import { Pool } from 'pg';
import { readFileSync } from 'fs';
import { resolve, join } from 'path';
import dotenv from 'dotenv';

dotenv.config();

interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  ssl?: boolean;
}

const config: DatabaseConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  database: process.env.DB_NAME || 'digital_key_system',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'password',
  ssl: process.env.NODE_ENV === 'production' ? true : false,
};

const pool = new Pool(config);

const projectRoot = resolve(__dirname, '..', '..', '..');
const schemaPath = join(projectRoot, 'database', 'postgres-schema.sql');
const seedPath = join(projectRoot, 'database', 'seed-data.sql');

function loadSql(path: string): string {
  const raw = readFileSync(path, 'utf-8');
  return raw.replace(/\uFEFF/g, '');
}

async function executeSql(filePath: string, description: string) {
  const sql = loadSql(filePath);
  console.log(`\n[INFO] Applying ${description}...`);
  await pool.query(sql);
  console.log(`[OK] ${description} applied.`);
}

async function resetSchema() {
  console.log('[INFO] Dropping public schema...');
  await pool.query(`
    DROP SCHEMA IF EXISTS public CASCADE;
    CREATE SCHEMA public;
    GRANT ALL ON SCHEMA public TO public;
    GRANT ALL ON SCHEMA public TO ${config.user};
  `);
  console.log('[OK] Public schema recreated.');
}

async function main() {
  try {
    await resetSchema();
    await executeSql(schemaPath, 'database schema');

    if (process.env.DB_SKIP_SEED?.toLowerCase() === 'true') {
      console.log('[INFO] Skipping seed data (DB_SKIP_SEED=true).');
    } else {
      await executeSql(seedPath, 'seed data');
    }

    console.log('\n[OK] Database initialization completed successfully.');
  } catch (error) {
    console.error('\n[ERROR] Database initialization failed:', error);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();
