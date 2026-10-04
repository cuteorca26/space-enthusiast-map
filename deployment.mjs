import { createWriteStream, existsSync, realpathSync, statSync } from 'node:fs';
import { mkdir, rename, rm } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

export function runtimeSettings(root, env = process.env, argv = process.argv) {
  const hostArg = argv.find(value => value.startsWith('--host='));
  const portArg = argv.find(value => value.startsWith('--port='));
  const host = hostArg?.slice(7) || env.HOST || '127.0.0.1';
  const port = Number(portArg?.slice(7) || env.PORT || 8765);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be between 1 and 65535');
  return {
    host, port,
    online: !['127.0.0.1', 'localhost', '::1'].includes(host),
    dataDirectory: resolve(env.DATA_DIR || resolve(root, 'data')),
  };
}

function contained(base, target) {
  const path = relative(base, target);
  return path !== '..' && !path.startsWith(`..${sep}`) && !isAbsolute(path);
}

export function publicFilePath(root, urlPath) {
  let path;
  try { path = decodeURIComponent(String(urlPath).split('?')[0]); }
  catch { return null; }
  if (path.includes('\\') || path.includes('\0')) return null;
  if (path === '/') path = '/frontend/index.html';
  const allowed = path.startsWith('/frontend/') ||
    /^\/node_modules\/(?:three\/build|satellite\.js\/dist|jszip\/dist)\//.test(path);
  if (!allowed) return null;
  const absolute = resolve(root, `.${path}`);
  if (!contained(resolve(root), absolute) || !existsSync(absolute) || !statSync(absolute).isFile()) return null;
  const real = realpathSync(absolute);
  // A symlink must not expose files outside its allowed public directory.
  const base = path.startsWith('/frontend/') ? resolve(root, 'frontend') :
    resolve(root, path.split('/').slice(1, 4).join('/'));
  if (!contained(base, real)) return null;
  return real;
}

export function sameOriginWrite(req) {
  if (!req.headers.origin) return true;
  try {
    const origin = new URL(req.headers.origin);
    return ['http:', 'https:'].includes(origin.protocol) && origin.host === req.headers.host;
  } catch { return false; }
}

// Stream downloads to disk so large satellite cloud files are not held twice in RAM.
export async function downloadCloudFile(url, filePath, { timeoutMs = 90000, minimumBytes = 1024 * 1024 } = {}) {
  await mkdir(dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok || !response.body) throw new Error(`Cloud download failed: HTTP ${response.status}`);
    await pipeline(Readable.fromWeb(response.body), createWriteStream(temporary, { flags: 'wx' }), { signal: controller.signal });
    if (statSync(temporary).size <= minimumBytes) throw new Error('Cloud download is incomplete');
    await rename(temporary, filePath);
  } finally {
    clearTimeout(timer);
    await rm(temporary, { force: true });
  }
}
