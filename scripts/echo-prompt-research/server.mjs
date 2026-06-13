#!/usr/bin/env node
import http from 'node:http';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  getDatasetStats,
  getDefaultOptions,
  getPromptHistoryState,
  getPromptVersionDetail,
  getRecentRuns,
  getRunBestPromptPath,
  getSeedPromptTemplates,
  listPromptVersions,
  normalizeOptions,
  runResearch,
  saveManualSamples,
} from './core.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, 'public');
const port = Number(process.env.ECHO_RESEARCH_PORT || 3010);
const runs = new Map();

function sendJson(res, status, payload) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(payload));
}

function sendText(res, status, text, contentType = 'text/plain; charset=utf-8') {
  res.writeHead(status, {
    'Content-Type': contentType,
    'Cache-Control': 'no-store',
  });
  res.end(text);
}

async function readJson(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 2 * 1024 * 1024) throw new Error('请求体过大');
    chunks.push(chunk);
  }
  const text = Buffer.concat(chunks).toString('utf8');
  return text ? JSON.parse(text) : {};
}

function createRunRecord(runId) {
  const record = {
    runId,
    status: 'running',
    events: [],
    clients: new Set(),
    result: null,
    error: '',
  };
  runs.set(runId, record);
  return record;
}

function pushEvent(record, event) {
  const payload = { ...event, at: new Date().toISOString() };
  record.events.push(payload);
  const wire = `event: ${payload.type || 'message'}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const client of record.clients) client.write(wire);
}

async function handleStartRun(req, res) {
  const body = await readJson(req);
  const runId = new Date().toISOString().replace(/[:.]/g, '-');
  const options = normalizeOptions({ ...body, runId });
  const record = createRunRecord(runId);
  runResearch(options, {
    onEvent(event) {
      pushEvent(record, event);
    },
  }).then((result) => {
    record.status = 'done';
    record.result = result.summary;
    for (const client of record.clients) client.end();
  }).catch((error) => {
    record.status = 'error';
    record.error = error instanceof Error ? error.message : String(error);
    pushEvent(record, { type: 'error', message: record.error });
    for (const client of record.clients) client.end();
  });
  sendJson(res, 202, { runId, status: 'running' });
}

async function handleEvents(runId, req, res) {
  const record = runs.get(runId);
  if (!record) {
    sendJson(res, 404, { error: 'run 不存在或服务已重启' });
    return;
  }
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-store',
    Connection: 'keep-alive',
  });
  for (const event of record.events) {
    res.write(`event: ${event.type || 'message'}\ndata: ${JSON.stringify(event)}\n\n`);
  }
  if (record.status === 'done' || record.status === 'error') {
    res.end();
    return;
  }
  record.clients.add(res);
  req.on('close', () => record.clients.delete(res));
}

async function handleRunStatus(runId, res) {
  const record = runs.get(runId);
  if (record) {
    sendJson(res, 200, {
      runId,
      status: record.status,
      events: record.events,
      summary: record.result,
      error: record.error,
    });
    return;
  }
  const recent = await getRecentRuns(50);
  const found = recent.find((item) => item.runId === runId);
  if (!found) {
    sendJson(res, 404, { error: 'run 不存在' });
    return;
  }
  sendJson(res, 200, { runId, status: 'done', summary: found });
}

async function handleBestPrompt(runId, res) {
  const filePath = getRunBestPromptPath(runId);
  if (!fsSync.existsSync(filePath)) {
    sendJson(res, 404, { error: 'best.prompt.txt 不存在' });
    return;
  }
  const text = await fs.readFile(filePath, 'utf8');
  res.writeHead(200, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Content-Disposition': `attachment; filename="${runId}-best.prompt.txt"`,
    'Cache-Control': 'no-store',
  });
  res.end(text);
}

async function serveIndex(res) {
  const html = await fs.readFile(path.join(publicDir, 'index.html'), 'utf8');
  sendText(res, 200, html, 'text/html; charset=utf-8');
}

async function router(req, res) {
  try {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    const pathname = decodeURIComponent(url.pathname);

    if (req.method === 'GET' && (pathname === '/' || pathname === '/research')) {
      await serveIndex(res);
      return;
    }

    if (req.method === 'GET' && pathname === '/favicon.ico') {
      res.writeHead(204, { 'Cache-Control': 'public, max-age=86400' });
      res.end();
      return;
    }

    if (req.method === 'GET' && pathname === '/api/research/state') {
      const [datasets, history, recentRuns] = await Promise.all([
        getDatasetStats(),
        getPromptHistoryState(),
        getRecentRuns(),
      ]);
      sendJson(res, 200, { defaults: getDefaultOptions(), datasets, history, recentRuns });
      return;
    }

    if (req.method === 'GET' && pathname === '/api/research/seed-prompts') {
      sendJson(res, 200, getSeedPromptTemplates());
      return;
    }

    if (req.method === 'POST' && pathname === '/api/research/samples') {
      sendJson(res, 200, await saveManualSamples(await readJson(req)));
      return;
    }

    if (req.method === 'POST' && pathname === '/api/research/runs') {
      await handleStartRun(req, res);
      return;
    }

    const bestPromptMatch = pathname.match(/^\/api\/research\/runs\/([^/]+)\/best-prompt$/);
    if (req.method === 'GET' && bestPromptMatch) {
      await handleBestPrompt(bestPromptMatch[1], res);
      return;
    }

    const eventsMatch = pathname.match(/^\/api\/research\/runs\/([^/]+)\/events$/);
    if (req.method === 'GET' && eventsMatch) {
      await handleEvents(eventsMatch[1], req, res);
      return;
    }

    const runMatch = pathname.match(/^\/api\/research\/runs\/([^/]+)$/);
    if (req.method === 'GET' && runMatch) {
      await handleRunStatus(runMatch[1], res);
      return;
    }

    if (req.method === 'GET' && pathname === '/api/research/versions') {
      sendJson(res, 200, { versions: await listPromptVersions() });
      return;
    }

    const versionMatch = pathname.match(/^\/api\/research\/versions\/(v\d+)$/);
    if (req.method === 'GET' && versionMatch) {
      sendJson(res, 200, await getPromptVersionDetail(versionMatch[1]));
      return;
    }

    sendJson(res, 404, { error: 'Not found' });
  } catch (error) {
    sendJson(res, 500, { error: error instanceof Error ? error.message : String(error) });
  }
}

const server = http.createServer(router);
server.listen(port, '0.0.0.0', () => {
  console.log(`小象回声 Auto Research 操作台：http://localhost:${port}/research`);
});
