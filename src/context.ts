import { dirname } from 'node:path';

import { ctxDir, ctxFile, recentFile } from './paths.ts';
import type { Store } from './store.ts';

const RECENT_MAX = 20;

/** True when `path` is the root itself or somewhere beneath it. */
export function underRoot(path: string, root: string): boolean {
    return path === root || path.startsWith(`${root}/`);
}

function readLine(file: string): string | null {
    try {
        const first = Deno.readTextFileSync(file).split('\n')[0]?.trim();
        return first !== undefined && first.length > 0 ? first : null;
    } catch {
        return null;
    }
}

function writeAtomic(file: string, body: string): void {
    try {
        Deno.mkdirSync(dirname(file), { recursive: true });
        const tmp = `${file}.${Deno.pid}.tmp`;
        Deno.writeTextFileSync(tmp, body);
        Deno.renameSync(tmp, file);
    } catch {
        // Losing context memory must never break a jump.
    }
}

/** The cwd a context was last seen at, or null when unusable. */
export function rememberedCwd(name: string, root: string): string | null {
    const cwd = readLine(ctxFile(name));
    if (cwd === null || !underRoot(cwd, root)) return null;
    try {
        return Deno.statSync(cwd).isDirectory ? cwd : null;
    } catch {
        return null;
    }
}

export function rememberCwd(name: string, cwd: string): void {
    writeAtomic(ctxFile(name), `${cwd}\n`);
}

export function forgetCtx(name: string): void {
    try {
        Deno.removeSync(ctxFile(name));
    } catch {
        // Never existed, which is the same outcome.
    }
}

export function renameCtx(from: string, to: string): void {
    try {
        Deno.renameSync(ctxFile(from), ctxFile(to));
    } catch {
        // No memory to carry over.
    }
}

export function readRecent(): string[] {
    try {
        return Deno.readTextFileSync(recentFile())
            .split('\n')
            .map((l) => {
                return l.trim();
            })
            .filter((l) => {
                return l.length > 0;
            });
    } catch {
        return [];
    }
}

/** Move `name` to the front of the global recent list. */
export function pushRecent(name: string): void {
    const next = [
        name,
        ...readRecent().filter((n) => {
            return n !== name;
        }),
    ].slice(0, RECENT_MAX);
    writeAtomic(recentFile(), `${next.join('\n')}\n`);
}

/** Drop names that are no longer bookmarks, so `b =` never lands nowhere. */
export function pruneRecent(store: Store): string[] {
    return readRecent().filter((n) => {
        return Object.hasOwn(store.bookmarks, n);
    });
}

export function activeCtx(): string | null {
    const v = Deno.env.get('B_CTX');
    return v !== undefined && v.length > 0 ? v : null;
}

export function previousCtx(): string | null {
    const v = Deno.env.get('B_CTX_PREV');
    return v !== undefined && v.length > 0 ? v : null;
}

export function ctxDirPath(): string {
    return ctxDir();
}
