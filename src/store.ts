import { dirname, isAbsolute, resolve } from 'node:path';

import { bookmarksFile, untildify } from './paths.ts';

export type Bookmark = {
    path: string;
    created?: string;
    hits: number;
};

export type Store = {
    version: 1;
    bookmarks: Record<string, Bookmark>;
};

export const RESERVED = new Set([
    'add',
    'a',
    'rm',
    'remove',
    'del',
    'mv',
    'rename',
    'ls',
    'list',
    'import',
    'off',
    'path',
    'get',
    'setup',
    'doctor',
    'starship',
    'shell-init',
    'completions',
    'help',
    'version',
    '__complete',
]);

const NAME_RE = /^[A-Za-z0-9._][A-Za-z0-9._-]*$/;

export function validateName(name: string): string | null {
    if (name.length === 0) return 'name is empty';
    if (!NAME_RE.test(name)) {
        return `invalid name "${name}" — use letters, digits, . _ - (no leading dash, no slash or space)`;
    }
    if (RESERVED.has(name)) return `"${name}" is a reserved subcommand`;
    // Names double as filenames under ctx/, so the dot entries are out.
    if (/^\.+$/.test(name)) return `"${name}" is not a usable name`;
    return null;
}

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

/** Sorted [name, bookmark] pairs. */
export function entries(store: Store): [string, Bookmark][] {
    return Object.entries(store.bookmarks).sort((a, b) => {
        return a[0].localeCompare(b[0]);
    });
}

/** Turn a user-supplied path into an absolute one. */
export function absPath(p: string, cwd = Deno.cwd()): string {
    const expanded = untildify(p);
    return isAbsolute(expanded) ? resolve(expanded) : resolve(cwd, expanded);
}

export type Resolution =
    | { kind: 'ok'; name: string; path: string; sub: string }
    | { kind: 'missing'; query: string }
    | { kind: 'ambiguous'; query: string; matches: string[] };

/**
 * Resolve a query like `proj` or `proj/src/lib` to a bookmark plus subpath.
 * Exact name wins; then unique prefix match; then unique substring match.
 */
export function resolveQuery(store: Store, query: string): Resolution {
    const slash = query.indexOf('/');
    const head = slash === -1 ? query : query.slice(0, slash);
    const sub = slash === -1 ? '' : query.slice(slash + 1);
    const names = Object.keys(store.bookmarks);

    let name: string | undefined;
    if (Object.hasOwn(store.bookmarks, head)) {
        name = head;
    } else {
        const lower = head.toLowerCase();
        for (const pick of [
            names.filter((n) => {
                return n.toLowerCase().startsWith(lower);
            }),
            names.filter((n) => {
                return n.toLowerCase().includes(lower);
            }),
        ]) {
            if (pick.length === 1) {
                name = pick[0];
                break;
            }
            if (pick.length > 1)
                return { kind: 'ambiguous', query: head, matches: pick.sort() };
        }
    }
    if (name === undefined) return { kind: 'missing', query: head };

    const base = store.bookmarks[name]!.path;
    return { kind: 'ok', name, path: sub ? resolve(base, sub) : base, sub };
}
