import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GAME_ROOT = path.resolve(REPO_ROOT, 'game');
const SHOTS_DIR = path.resolve(REPO_ROOT, 'screenshots');
const HOST = '127.0.0.1';
const PORT = 8917;
const BASE = `http://${HOST}:${PORT}/index.html`;

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.css': 'text/css; charset=utf-8',
};

function serveFile(req, res) {
  let rel;
  try {
    rel = decodeURIComponent(new URL(req.url, `http://${HOST}`).pathname);
  } catch {
    res.writeHead(404);
    res.end('Not found');
    return;
  }
  rel = rel.replace(/^\/+/, '');
  if (rel === '') rel = 'index.html';

  const filePath = path.resolve(GAME_ROOT, rel);
  if (filePath !== GAME_ROOT && !filePath.startsWith(GAME_ROOT + path.sep)) {
    res.writeHead(404);
    res.end('Not found');
    return;
  }

  let data;
  try {
    data = fs.readFileSync(filePath);
  } catch {
    res.writeHead(404);
    res.end('Not found');
    return;
  }

  const type = CONTENT_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
  res.writeHead(200, { 'Content-Type': type, 'Content-Length': data.length });
  res.end(data);
}

function startServer() {
  const server = http.createServer(serveFile);
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(PORT, HOST, () => {
      server.removeListener('error', reject);
      resolve(server);
    });
  });
}

function closeServer(server) {
  return new Promise((resolve) => server.close(() => resolve()));
}

async function main() {
  fs.mkdirSync(SHOTS_DIR, { recursive: true });

  const shots = JSON.parse(fs.readFileSync(path.resolve(REPO_ROOT, 'shots.json'), 'utf8'));
  const scratchRequire = createRequire('/home/hatch/workspace/makefun/scratch-game/package.json');
  const puppeteer = scratchRequire('puppeteer');

  const server = await startServer();
  let browser;
  let failed = false;

  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-gpu', '--force-device-scale-factor=1'],
    });

    for (const shot of shots) {
      const page = await browser.newPage();
      const errors = [];
      try {
        await page.setViewport({ width: 1280, height: 720 });
        page.on('pageerror', (err) => {
          const message = err && err.message ? err.message : String(err);
          errors.push(message.replace(/\s+/g, ' ').trim());
        });

        await page.goto(BASE + shot.query, { waitUntil: 'load', timeout: 30000 });
        await page.waitForFunction('window.__shotReady === true', { timeout: 20000 });

        const shotPath = path.join(SHOTS_DIR, shot.name);
        await page.screenshot({ path: shotPath, type: 'jpeg', quality: 84 });
        const bytes = fs.statSync(shotPath).size;
        console.log(`${shot.name} ${bytes}`);
      } catch (err) {
        failed = true;
        const message = err && err.message ? err.message : String(err);
        console.log(`FAILED ${shot.name} ${message.replace(/\s+/g, ' ').trim()}`);
      } finally {
        for (const message of errors) {
          failed = true;
          console.log(`PAGEERROR ${shot.name} ${message}`);
        }
        await page.close();
      }
    }
  } finally {
    if (browser) await browser.close();
    await closeServer(server);
  }

  if (failed) process.exit(1);
  console.log('CAPTURE OK');
  process.exit(0);
}

main().catch((err) => {
  const message = err && err.message ? err.message : String(err);
  console.log(`CAPTURE FAILED ${message.replace(/\s+/g, ' ').trim()}`);
  process.exit(1);
});
