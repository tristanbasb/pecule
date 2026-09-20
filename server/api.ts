import path from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';
import { createDbStore } from './db.ts';
import { createHistoryCache, getQuotes, search } from './market.ts';

/**
 * API locale de Pécule, branchée directement sur le serveur Vite (dev et preview).
 * Les données restent dans le dossier `data/` du projet.
 */

const MAX_BODY_BYTES = 50 * 1024 * 1024;

class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

function send(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

function readJsonBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new HttpError(413, 'Données trop volumineuses'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(new HttpError(400, 'JSON invalide'));
      }
    });
    req.on('error', reject);
  });
}

function hostnameOf(value: string | undefined, withScheme: boolean) {
  if (!value) return '';
  try {
    return new URL(withScheme ? value : `http://${value}`).hostname.replace(/^\[|\]$/g, '').toLowerCase();
  } catch {
    return '';
  }
}

const isPrivateIp = (h: string) => /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(h);

function isTrustedHost(h: string) {
  if (h === 'localhost' || h === '127.0.0.1' || h === '::1' || h.endsWith('.localhost')) return true;
  // Accès depuis le téléphone sur le même réseau : lancer avec PECULE_LAN=1 et `--host`.
  return process.env.PECULE_LAN === '1' && isPrivateIp(h);
}

/**
 * Protège les données contre les autres sites ouverts dans le navigateur :
 * hôte local obligatoire (anti DNS-rebinding), en-tête personnalisé
 * (force une requête CORS préalable que l'on ne valide jamais) et origine identique.
 */
function rejectReason(req: IncomingMessage): string | null {
  const host = hostnameOf(req.headers.host, false);
  if (!isTrustedHost(host)) return 'Hôte non autorisé';
  if (req.headers['x-pecule'] !== '1') return 'Requête non autorisée';
  const origin = req.headers.origin;
  if (origin && hostnameOf(origin, true) !== host) return 'Origine non autorisée';
  return null;
}

const listParam = (url: URL, key: string) =>
  (url.searchParams.get(key) ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 150);

export function createApiHandler(root: string) {
  const dataDir = process.env.PECULE_DATA_DIR
    ? path.resolve(process.env.PECULE_DATA_DIR)
    : path.join(root, 'data');
  const db = createDbStore(dataDir);
  const getHistory = createHistoryCache(path.join(dataDir, 'cache'));

  return async function handle(req: IncomingMessage, res: ServerResponse, next: (err?: unknown) => void) {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (!url.pathname.startsWith('/api/')) return next();

    const denied = rejectReason(req);
    if (denied) return send(res, 403, { error: denied });

    try {
      switch (`${req.method} ${url.pathname}`) {
        case 'GET /api/db':
          return send(res, 200, { file: await db.read(), location: db.file });

        case 'PUT /api/db': {
          const body = (await readJsonBody(req)) as { baseRev?: unknown; data?: unknown };
          if (typeof body?.baseRev !== 'number' || !body.data || typeof body.data !== 'object') {
            throw new HttpError(400, 'Requête invalide');
          }
          const result = await db.write(body.baseRev, body.data);
          return result.ok
            ? send(res, 200, { rev: result.rev, savedAt: result.savedAt })
            : send(res, 409, { conflict: result.conflict });
        }

        case 'GET /api/backups':
          return send(res, 200, { backups: await db.listBackups(), dir: path.join(dataDir, 'backups') });

        case 'GET /api/quotes':
          return send(res, 200, await getQuotes(listParam(url, 'yahoo'), listParam(url, 'coingecko')));

        case 'GET /api/history': {
          const provider = url.searchParams.get('provider');
          const symbol = url.searchParams.get('symbol')?.trim();
          if ((provider !== 'yahoo' && provider !== 'coingecko') || !symbol) {
            throw new HttpError(400, 'Paramètres invalides');
          }
          return send(res, 200, await getHistory(provider, symbol));
        }

        case 'GET /api/search':
          return send(res, 200, { results: await search(url.searchParams.get('q') ?? '') });

        default:
          return send(res, 404, { error: 'Route inconnue' });
      }
    } catch (err) {
      const status = typeof (err as { status?: unknown }).status === 'number' ? (err as HttpError).status : 500;
      if (status >= 500) console.error('[pecule-api]', err);
      return send(res, status, { error: err instanceof Error ? err.message : 'Erreur inconnue' });
    }
  };
}

export function peculeApi(): Plugin {
  let handle: ReturnType<typeof createApiHandler> | undefined;
  const middleware = (req: IncomingMessage, res: ServerResponse, next: (err?: unknown) => void) => {
    if (!handle) return next();
    void handle(req, res, next);
  };
  return {
    name: 'pecule-api',
    configResolved(config) {
      handle = createApiHandler(config.root);
    },
    configureServer(server) {
      server.middlewares.use(middleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware);
    },
  };
}
