import { promises as fs } from 'node:fs';
import path from 'node:path';

/** Enveloppe du fichier de données enregistré sur le disque. */
export interface DbFile {
  app: 'pecule';
  rev: number;
  savedAt: string;
  data: unknown;
}

export type WriteResult =
  | { ok: true; rev: number; savedAt: string }
  | { ok: false; conflict: DbFile };

const BACKUPS_TO_KEEP = 30;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Sous Windows, un antivirus peut verrouiller brièvement le fichier : on réessaie. */
async function renameWithRetry(from: string, to: string) {
  for (let attempt = 0; ; attempt++) {
    try {
      await fs.rename(from, to);
      return;
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (attempt >= 6 || (code !== 'EPERM' && code !== 'EBUSY' && code !== 'EACCES')) throw err;
      await sleep(40 * (attempt + 1));
    }
  }
}

export function createDbStore(dataDir: string) {
  const file = path.join(dataDir, 'pecule.json');
  const backupsDir = path.join(dataDir, 'backups');
  let queue: Promise<unknown> = Promise.resolve();

  async function read(): Promise<DbFile | null> {
    let raw: string;
    try {
      raw = await fs.readFile(file, 'utf8');
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw err;
    }
    const parsed = JSON.parse(raw) as DbFile;
    if (typeof parsed?.rev !== 'number' || typeof parsed.data !== 'object') {
      throw new Error(`Le fichier ${file} n'a pas le format attendu.`);
    }
    return parsed;
  }

  /** Une copie du fichier par jour, avant la première écriture de la journée. */
  async function dailyBackup() {
    const day = new Date().toISOString().slice(0, 10);
    const target = path.join(backupsDir, `pecule-${day}.json`);
    try {
      await fs.access(target);
      return;
    } catch {
      /* pas encore de sauvegarde aujourd'hui */
    }
    try {
      await fs.mkdir(backupsDir, { recursive: true });
      await fs.copyFile(file, target);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return;
      throw err;
    }
    const names = (await fs.readdir(backupsDir))
      .filter((n) => /^pecule-\d{4}-\d{2}-\d{2}\.json$/.test(n))
      .sort();
    for (const old of names.slice(0, Math.max(0, names.length - BACKUPS_TO_KEEP))) {
      await fs.rm(path.join(backupsDir, old), { force: true });
    }
  }

  function write(baseRev: number, data: unknown): Promise<WriteResult> {
    const run = async (): Promise<WriteResult> => {
      const current = await read();
      if (current && current.rev !== baseRev) return { ok: false, conflict: current };

      await fs.mkdir(dataDir, { recursive: true });
      await dailyBackup();

      const next: DbFile = {
        app: 'pecule',
        rev: (current?.rev ?? baseRev) + 1,
        savedAt: new Date().toISOString(),
        data,
      };
      const tmp = `${file}.${process.pid}.tmp`;
      await fs.writeFile(tmp, JSON.stringify(next), 'utf8');
      await renameWithRetry(tmp, file);
      return { ok: true, rev: next.rev, savedAt: next.savedAt };
    };
    const result = queue.then(run, run);
    queue = result.catch(() => undefined);
    return result;
  }

  async function listBackups() {
    try {
      const names = await fs.readdir(backupsDir);
      return names.filter((n) => n.endsWith('.json')).sort().reverse();
    } catch {
      return [];
    }
  }

  return { file, dataDir, read, write, listBackups };
}

export type DbStore = ReturnType<typeof createDbStore>;
