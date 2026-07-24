/**
 * 无 Docker CLI 时，等价验证 Dockerfile 的 build/deploy/runtime 阶段：
 * 1) pnpm build server + admin
 * 2) pnpm deploy --prod 到 .tmp/docker-smoke/server
 * 3) 以生产 env + 临时 SQLite 启动 dist/index.js
 * 4) GET /health 冒烟后清理进程
 *
 * Usage: node scripts/docker-smoke-local.mjs
 * Exit: 0 OK; non-zero fail
 */
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const smoke = path.join(root, '.tmp', 'docker-smoke');
const serverOut = path.join(smoke, 'server');
const dataDir = path.join(smoke, 'data');
const db = path.join(dataDir, 'huajian_pay.db');
const outLog = path.join(smoke, 'server.out.log');
const errLog = path.join(smoke, 'server.err.log');
const port = Number(process.env.SMOKE_PORT || 18080);

function run(cmd, args, opts = {}) {
  console.log('+', cmd, args.join(' '));
  const isWindows = process.platform === 'win32';
  const executable = isWindows ? process.env.ComSpec || 'cmd.exe' : cmd;
  const commandArgs = isWindows ? ['/d', '/s', '/c', cmd, ...args] : args;
  const r = spawnSync(executable, commandArgs, {
    cwd: root,
    stdio: 'inherit',
    shell: false,
    env: process.env,
    ...opts,
  });
  if (r.status !== 0) {
    throw new Error(`command failed (${r.status}): ${cmd} ${args.join(' ')}`);
  }
}

function rmrf(p) {
  fs.rmSync(p, { recursive: true, force: true });
}

function health() {
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${port}/health`, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => resolve({ ok: res.statusCode === 200, status: res.statusCode, body }));
    });
    req.on('error', (e) => resolve({ ok: false, error: e.message }));
    req.setTimeout(2000, () => {
      req.destroy();
      resolve({ ok: false, error: 'timeout' });
    });
  });
}

async function main() {
  fs.mkdirSync(dataDir, { recursive: true });
  if (fs.existsSync(db)) fs.unlinkSync(db);
  if (fs.existsSync(serverOut)) rmrf(serverOut);

  run('pnpm', ['--filter', '@huajian/server', 'build']);
  run('pnpm', ['--filter', '@huajian/admin', 'build']);
  run('pnpm', ['--filter', '@huajian/server', 'deploy', '--prod', serverOut]);

  const indexJs = path.join(serverOut, 'dist', 'index.js');
  if (!fs.existsSync(indexJs)) throw new Error(`DIST_MISSING: ${indexJs}`);

  const layout = {
    distIndex: true,
    packageName: JSON.parse(fs.readFileSync(path.join(serverOut, 'package.json'), 'utf8')).name,
    hasFastify: fs.existsSync(path.join(serverOut, 'node_modules', 'fastify')),
    hasLibsql: fs.existsSync(path.join(serverOut, 'node_modules', '@libsql')),
    adminDistOnHost: fs.existsSync(path.join(root, 'apps', 'admin', 'dist', 'index.html')),
  };
  console.log('LAYOUT', JSON.stringify(layout, null, 2));
  if (!layout.hasFastify) throw new Error('missing fastify in deploy tree');

  const env = {
    ...process.env,
    NODE_ENV: 'production',
    APP_ENV: 'production',
    APP_NAME: 'HuaJian_Pay',
    APP_URL: `http://127.0.0.1:${port}`,
    APP_SECRET: 'smoke-secret-change-me',
    HOST: '127.0.0.1',
    PORT: String(port),
    CHANNEL_MODE: 'mock',
    DB_DRIVER: 'sqlite',
    DB_DSN: db,
    ADMIN_USERNAME: 'admin',
    ADMIN_PASSWORD: 'smoke-admin',
    PLATFORM_PID: '1000',
    PLATFORM_KEY: 'smoke-platform-key',
  };

  const outFd = fs.openSync(outLog, 'w');
  const errFd = fs.openSync(errLog, 'w');
  const child = spawn(process.execPath, ['dist/index.js'], {
    cwd: serverOut,
    env,
    stdio: ['ignore', outFd, errFd],
    windowsHide: true,
  });
  console.log('PID=' + child.pid);

  let result = null;
  try {
    for (let i = 0; i < 40; i++) {
      await new Promise((r) => setTimeout(r, 400));
      if (child.exitCode !== null) {
        throw new Error(
          `PROCESS_EXITED ${child.exitCode}\n` +
            fs.readFileSync(errLog, 'utf8') +
            fs.readFileSync(outLog, 'utf8'),
        );
      }
      result = await health();
      if (result.ok) break;
    }
    if (!result?.ok) {
      throw new Error(
        `HEALTH_FAIL ${JSON.stringify(result)}\n` +
          fs.readFileSync(errLog, 'utf8') +
          fs.readFileSync(outLog, 'utf8'),
      );
    }
    console.log('HEALTH_OK', result.status, result.body);
    console.log('DB_EXISTS=' + fs.existsSync(db));
  } finally {
    try {
      child.kill('SIGTERM');
    } catch {
      /* ignore */
    }
    await new Promise((r) => setTimeout(r, 400));
    if (child.exitCode === null) {
      try {
        child.kill('SIGKILL');
      } catch {
        /* ignore */
      }
    }
    try {
      fs.closeSync(outFd);
      fs.closeSync(errFd);
    } catch {
      /* ignore */
    }
    console.log('STOPPED');
  }

  console.log('SMOKE_PASS');
}

main().catch((e) => {
  console.error('SMOKE_FAIL', e.message || e);
  process.exit(1);
});
