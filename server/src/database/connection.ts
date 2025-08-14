import { Pool, PoolClient } from 'pg';
import { readFileSync } from 'fs';
import { join } from 'path';
import dotenv from 'dotenv';

dotenv.config();

interface DatabaseConfig {
    host: string;
    port: number;
    database: string;
    user: string;
    password: string;
    ssl?: boolean;
    max?: number;
    idleTimeoutMillis?: number;
    connectionTimeoutMillis?: number;
}

class Database {
    private static instance: Database;
    private pool: Pool;
    private isInitialized: boolean = false;

    private constructor() {
        const config: DatabaseConfig = {
            host: process.env.DB_HOST || 'localhost',
            port: parseInt(process.env.DB_PORT || '5432'),
            database: process.env.DB_NAME || 'digital_key_system',
            user: process.env.DB_USER || 'postgres',
            password: process.env.DB_PASSWORD || 'password',
            ssl: process.env.NODE_ENV === 'production' ? true : false,
            max: parseInt(process.env.DB_POOL_MAX || '10'),
            idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT || '30000'),
            connectionTimeoutMillis: parseInt(process.env.DB_CONNECTION_TIMEOUT || '10000'),
        };

        this.pool = new Pool(config);
        this.initializeConnection();
    }

    static getInstance(): Database {
        if (!Database.instance) {
            Database.instance = new Database();
        }
        return Database.instance;
    }

    private async initializeConnection(): Promise<void> {
        try {
            const client = await this.pool.connect();
            console.log('Connected to PostgreSQL database');
            client.release();
            
            if (!this.isInitialized) {
                await this.initializeTables();
                this.isInitialized = true;
            }
        } catch (err) {
            console.error('Error connecting to database:', err);
            throw err;
        }
    }

    private async initializeTables(): Promise<void> {
        try {
            // Check if tables already exist (Docker init scripts may have created them)
            const result = await this.query(`
                SELECT EXISTS (
                    SELECT FROM information_schema.tables 
                    WHERE table_schema = 'public' 
                    AND table_name = 'users'
                );
            `);
            
            if (result.rows[0].exists) {
                console.log('Database schema already exists, skipping initialization');
                return;
            }

            const schemaPath = join(__dirname, '../../database/postgres-schema.sql');
            const sqlScript = readFileSync(schemaPath, 'utf-8');
            
            await this.query(sqlScript);
            console.log('Database schema initialized successfully');
        } catch (err) {
            console.error('Error initializing database schema:', err);
            throw err;
        }
    }

    async query(text: string, params?: any[]): Promise<any> {
        const client = await this.pool.connect();
        try {
            const result = await client.query(text, params);
            return result;
        } finally {
            client.release();
        }
    }

    async run(sql: string, params: any[] = []): Promise<any> {
        const result = await this.query(sql, params);
        return {
            lastID: result.rows[0]?.id || null,
            changes: result.rowCount || 0
        };
    }

    async get(sql: string, params: any[] = []): Promise<any> {
        const result = await this.query(sql, params);
        return result.rows[0] || null;
    }

    async all(sql: string, params: any[] = []): Promise<any[]> {
        const result = await this.query(sql, params);
        return result.rows || [];
    }

    async healthCheck(): Promise<boolean> {
        try {
            await this.query('SELECT 1');
            return true;
        } catch (err) {
            console.error('Database health check failed:', err);
            return false;
        }
    }

    async close(): Promise<void> {
        try {
            await this.pool.end();
            console.log('Database connection pool closed');
        } catch (err) {
            console.error('Error closing database connection pool:', err);
            throw err;
        }
    }

    getPool(): Pool {
        return this.pool;
    }
}

export default Database;