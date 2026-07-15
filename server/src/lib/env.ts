import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load the server-local .env even when PM2 or a panel starts Node from a parent cwd.
// Tests may deliberately point Prisma at an isolated database and must never be
// redirected to the developer database by this production-oriented override.
const preserveExplicitTestDatabase = process.env.NODE_ENV === 'test' && Boolean(process.env.DATABASE_URL);
dotenv.config({
  path: path.resolve(__dirname, '../../.env'),
  override: !preserveExplicitTestDatabase,
});

// Keep the conventional cwd .env as a fallback for local tooling.
dotenv.config();
