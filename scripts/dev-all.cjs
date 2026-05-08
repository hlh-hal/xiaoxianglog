const { spawn } = require('node:child_process');
const path = require('node:path');

const commands = [
  {
    name: 'server',
    command: 'npm',
    args: ['run', 'dev', '--prefix', 'server'],
  },
  {
    name: 'web',
    command: 'npm',
    args: ['run', 'dev'],
  },
];

const children = commands.map(({ name, command, args }) => {
  const child = spawn(command, args, {
    cwd: path.resolve(__dirname, '..'),
    shell: true,
    stdio: 'inherit',
    env: process.env,
  });

  child.on('exit', (code, signal) => {
    console.log(`[${name}] exited${signal ? ` with signal ${signal}` : ` with code ${code}`}`);
    if (code && code !== 0) {
      shutdown();
      process.exitCode = code;
    }
  });

  return child;
});

function shutdown() {
  for (const child of children) {
    if (child.killed) continue;
    if (process.platform === 'win32') {
      spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], {
        stdio: 'ignore',
        shell: false,
      });
    } else {
      child.kill('SIGTERM');
    }
  }
}

process.on('SIGINT', () => {
  shutdown();
  process.exit();
});

process.on('SIGTERM', () => {
  shutdown();
  process.exit();
});
