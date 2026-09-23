import { dirname } from 'node:path';

import { type Store, underRoot } from './bookmarks/model.ts';
import { ctxDir, ctxFile, recentFile } from './paths.ts';

const RECENT_MAX = 20;

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

/** Drop a context's remembered cwd and its place in the recent list. */
export function forgetCtx(name: string): void {
    try {
        Deno.removeSync(ctxFile(name));
    } catch {
        // Never existed, which is the same outcome.
    }
    const recent = readRecent();
    if (recent.includes(name)) {
        writeRecent(
            recent.filter((n) => {
                return n !== name;
            }),
        );
    }
}

/** Carry a context's remembered cwd and recent-list position over to a new name. */
export function renameCtx(from: string, to: string): void {
    try {
        Deno.renameSync(ctxFile(from), ctxFile(to));
    } catch {
        // No memory to carry over; don't let a stale file speak for the new name.
        try {
            Deno.removeSync(ctxFile(to));
        } catch {
            // Nothing stale either.
        }
    }
    const recent = readRecent();
    if (recent.includes(from)) {
        writeRecent(
            recent
                .filter((n) => {
                    return n !== to;
                })
                .map((n) => {
                    return n === from ? to : n;
                }),
        );
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

function writeRecent(names: string[]): void {
    writeAtomic(recentFile(), `${names.slice(0, RECENT_MAX).join('\n')}\n`);
}

/** Move `name` to the front of the global recent list. */
export function pushRecent(name: string): void {
    writeRecent([
        name,
        ...readRecent().filter((n) => {
            return n !== name;
        }),
    ]);
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
