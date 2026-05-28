import cors from 'cors';
import express from 'express';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ZodError } from 'zod';
import { openDb } from './db.js';
import { adminRouter } from './routes/admin.js';
import { analyticsRouter } from './routes/analytics.js';
import { gamesRouter } from './routes/games.js';
import { summaryRouter } from './routes/summary.js';
import { importGameDumps } from './jsonImport.js';

const port = Number(process.env.PORT ?? 5174);
const webOrigin = process.env.WEB_ORIGIN ?? 'http://localhost:5173';
const moduleDir = dirname(fileURLToPath(import.meta.url));
const staticDir = process.env.STATIC_DIR ?? join(moduleDir, '../../webapp/dist');
const app = express();
const db = openDb();
const imported = importGameDumps(db);

app.use(cors({ origin: webOrigin }));
app.use(express.json({ limit: '2mb' }));

app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.use('/api/summary', summaryRouter(db));
app.use('/api/games', gamesRouter(db));
app.use('/api/analytics', analyticsRouter(db));
app.use('/api/admin', adminRouter(db));

if (existsSync(staticDir)) {
  app.use(express.static(staticDir));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) {
      next();
      return;
    }
    res.sendFile(join(staticDir, 'index.html'));
  });
}

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  void _next;
  if (err instanceof ZodError) {
    res.status(400).json({ error: err.errors.map((item) => item.message).join(', ') });
    return;
  }
  const message = err instanceof Error ? err.message : 'Unexpected server error';
  res.status(500).json({ error: message });
});

app.listen(port, () => {
  console.log(`HDTBgTracker API listening on http://localhost:${port}`);
  if (imported.files > 0) {
    console.log(`Imported ${imported.games} game dumps (${imported.turns} turns) from JSON`);
  }
});
