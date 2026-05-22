import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../.env'), override: true });
dotenv.config();

const port = Number(process.env.PORT || 3001);
const appBaseUrl = `http://127.0.0.1:${port}`;
const cpamcBaseUrl = (process.env.CPAMC_BASE_URL || '').replace(/\/+$/, '');
const cpamcApiKey = process.env.CPAMC_API_KEY || '';

function printResult(name, result) {
  const status = result.ok ? 'OK' : 'FAIL';
  console.log(`[${status}] ${name}: ${result.message}`);
  if (result.body) {
    console.log(result.body);
  }
}

async function readText(response) {
  return (await response.text()).slice(0, 1000);
}

async function checkHealth() {
  try {
    const response = await fetch(`${appBaseUrl}/api/health`, {
      signal: AbortSignal.timeout(5000),
    });
    const body = await readText(response);
    const hasBuild = body.includes('cpamc-only-20260520');
    return {
      ok: response.ok && hasBuild,
      message: `status=${response.status}, buildLoaded=${hasBuild}, url=${appBaseUrl}/api/health`,
      body,
    };
  } catch (error) {
    return {
      ok: false,
      message: `cannot reach local app health at ${appBaseUrl}: ${error.message}`,
    };
  }
}

async function checkModels() {
  if (!cpamcBaseUrl) {
    return { ok: false, message: 'CPAMC_BASE_URL is not configured' };
  }
  if (!cpamcApiKey) {
    return { ok: false, message: 'CPAMC_API_KEY is not configured' };
  }

  try {
    const response = await fetch(`${cpamcBaseUrl}/models`, {
      headers: { Authorization: `Bearer ${cpamcApiKey}` },
      signal: AbortSignal.timeout(10000),
    });
    const body = await readText(response);
    const hasLite = body.includes('LongCat-Flash-Lite');
    const hasThinking = body.includes('LongCat-Flash-Thinking-2601');
    return {
      ok: response.ok && hasLite && hasThinking,
      message: `status=${response.status}, hasLite=${hasLite}, hasThinking=${hasThinking}, url=${cpamcBaseUrl}/models`,
      body,
    };
  } catch (error) {
    return {
      ok: false,
      message: `cannot reach CPAMC models at ${cpamcBaseUrl}/models: ${error.message}`,
    };
  }
}

async function checkCompletion() {
  if (!cpamcBaseUrl || !cpamcApiKey) {
    return { ok: false, message: 'CPAMC_BASE_URL or CPAMC_API_KEY is not configured' };
  }

  try {
    const response = await fetch(`${cpamcBaseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cpamcApiKey}`,
      },
      body: JSON.stringify({
        model: 'LongCat-Flash-Lite',
        messages: [{ role: 'user', content: 'Reply with OK only.' }],
        max_tokens: 16,
        stream: false,
      }),
      signal: AbortSignal.timeout(30000),
    });
    const body = await readText(response);
    return {
      ok: response.ok,
      message: `status=${response.status}, url=${cpamcBaseUrl}/chat/completions`,
      body,
    };
  } catch (error) {
    return {
      ok: false,
      message: `cannot call CPAMC completion at ${cpamcBaseUrl}/chat/completions: ${error.message}`,
    };
  }
}

console.log('CPAMC doctor');
console.log(`appBaseUrl=${appBaseUrl}`);
console.log(`cpamcBaseUrl=${cpamcBaseUrl || '(not configured)'}`);
console.log(`cpamcKeyConfigured=${Boolean(cpamcApiKey)}`);
console.log('');

printResult('app health uses latest build', await checkHealth());
console.log('');
printResult('CPAMC models', await checkModels());
console.log('');
printResult('CPAMC LongCat Lite completion', await checkCompletion());
