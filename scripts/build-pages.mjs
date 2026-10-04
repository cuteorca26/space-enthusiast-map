import { cp, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = resolve(root, 'dist');
const value = (process.env.APP_URL || '').trim();
let appUrl = '';
if (value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
    throw new Error('APP_URL must be an HTTPS app URL without credentials, queries or fragments');
  }
  appUrl = url.href;
}
const escape = text => text.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
await mkdir(output, { recursive: true });
await cp(resolve(root, 'frontend/assets/space-enthusiast-orca-icon-v2.png'), resolve(output, 'icon.png'));
const content = appUrl ? `<iframe title="航天爱好者地图" src="${escape(appUrl)}" allow="fullscreen" allowfullscreen></iframe>
<a class="direct" href="${escape(appUrl)}" target="_blank" rel="noopener">全屏打开地图 ↗</a>
<p class="notice">首次打开可能需要等待服务启动。若地图未显示，请点击右上角直接打开。</p>` :
`<main><img src="icon.png" alt="" /><h1>航天爱好者地图</h1><p>在线地图正在准备中，请稍后再来。</p></main>`;
await writeFile(resolve(output, 'index.html'), `<!doctype html>
<html lang="zh-CN"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width,initial-scale=1" />
<title>航天爱好者地图</title><link rel="icon" href="icon.png" />
<style>html,body{margin:0;width:100%;height:100%;background:#091625;color:#dce8f5;font-family:system-ui,"Microsoft YaHei",sans-serif}iframe{position:fixed;inset:0;border:0;width:100%;height:100%}.direct{position:fixed;right:12px;top:12px;z-index:2;color:#e8f5ff;background:#16334bea;padding:8px 14px;border-radius:8px;text-decoration:none;font-size:13px}.notice{position:fixed;bottom:0;left:50%;transform:translateX(-50%);max-width:90vw;text-align:center;background:#16334bdd;border-radius:8px;padding:8px 12px;pointer-events:none;font-size:12px;animation:fade 1s 30s forwards}main{height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center}main img{width:112px;height:112px;object-fit:contain}main p{color:#adc2d7}@keyframes fade{to{opacity:0}}</style>
</head><body>${content}</body></html>`);
await writeFile(resolve(output, '.nojekyll'), '');
console.log(appUrl ? `GitHub Pages entry prepared for ${appUrl}` : 'GitHub Pages entry prepared; APP_URL is not configured yet.');
