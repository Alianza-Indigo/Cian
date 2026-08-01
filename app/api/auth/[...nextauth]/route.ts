import { handlers } from '@/lib/auth';

export const { GET, POST } = handlers;

// Auth.js necesita el runtime de Node porque las sesiones viven en Postgres.
export const runtime = 'nodejs';
