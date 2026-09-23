import { resolve } from 'node:path';

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

/** True when `path` is the root itself or somewhere beneath it. */
export function underRoot(path: string, root: string): boolean {
    return (
        path === root || path.startsWith(root.endsWith('/') ? root : `${root}/`)
    );
}

/** Sorted [name, bookmark] pairs. */
export function entries(store: Store): [string, Bookmark][] {
    return Object.entries(store.bookmarks).sort((a, b) => {
        return a[0].localeCompare(b[0]);
    });
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
