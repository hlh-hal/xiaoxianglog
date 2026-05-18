import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load the server-local .env even when PM2 or a panel starts Node from a parent cwd.
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

// Keep the conventional cwd .env as a fallback for local tooling.
dotenv.config();
