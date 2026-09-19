import { dirname } from 'node:path';

import type { Bookmark, Store } from './model.ts';

import { bookmarksFile } from '../paths.ts';

/** Persistence required by bookmark commands; implementations may use files or memory. */
export type BookmarkRepository = {
    load(): Store;
    save(store: Store): void;
};

const EMPTY: Store = { version: 1, bookmarks: {} };

function isRecord(v: unknown): v is Record<string, unknown> {
    return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Hand-rolled parsing keeps this CLI dependency-free, which matters: the
 * completion backend runs on every Tab press.
 */
function parseStore(json: unknown, file: string): Store {
    if (!isRecord(json) || !isRecord(json.bookmarks)) {
        throw new Error(
            `${file} has an unexpected shape (expected { bookmarks: { ... } })`,
        );
    }
    const bookmarks: Record<string, Bookmark> = {};
    for (const [name, value] of Object.entries(json.bookmarks)) {
        if (
            !isRecord(value) ||
            typeof value.path !== 'string' ||
            value.path.length === 0
        )
            continue;
        bookmarks[name] = {
            path: value.path,
            created:
                typeof value.created === 'string' ? value.created : undefined,
            hits:
                typeof value.hits === 'number' && Number.isFinite(value.hits)
                    ? value.hits
                    : 0,
        };
    }
    return { version: 1, bookmarks };
}

export function load(): Store {
    const file = bookmarksFile();
    let raw: string;
    try {
        raw = Deno.readTextFileSync(file);
    } catch (err) {
        if (err instanceof Deno.errors.NotFound) return structuredClone(EMPTY);
        throw err;
    }
    let json: unknown;
    try {
        json = JSON.parse(raw);
    } catch {
        throw new Error(`${file} is not valid JSON`);
    }
    return parseStore(json, file);
}

export function save(store: Store): void {
    const file = bookmarksFile();
    Deno.mkdirSync(dirname(file), { recursive: true });
    const tmp = `${file}.${Deno.pid}.tmp`;
    Deno.writeTextFileSync(tmp, JSON.stringify(store, null, 2) + '\n');
    Deno.renameSync(tmp, file);
}
