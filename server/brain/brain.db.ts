import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from './schema.js';

// The URL should be provided in .env
const sql = neon(process.env.BRAIN_DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/brain');

export const brainDb = drizzle(sql, { schema });
