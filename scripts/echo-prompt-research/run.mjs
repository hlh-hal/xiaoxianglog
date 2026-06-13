#!/usr/bin/env node
import { parseArgs, runResearch } from './core.mjs';

const options = parseArgs(process.argv.slice(2));

runResearch(options, {
  onEvent(event) {
    if (event.type === 'version') {
      console.log(`[${event.iteration}] ${event.decision} ${event.version} score=${event.score.toFixed(3)} best=${event.bestScore.toFixed(3)} commit=${String(event.commitHash || '').slice(0, 8)}`);
    }
    if (event.type === 'log') console.log(event.message);
  },
}).then((result) => {
  console.log(`Auto Research 完成：${result.outDir}`);
  console.log(`最佳版本：${result.summary.bestVersion}`);
  console.log(`最佳分数：${result.summary.bestScore.toFixed(3)}`);
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
