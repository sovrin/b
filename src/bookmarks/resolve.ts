import { UserError } from '../errors.ts';
import { entries, resolveQuery, type Resolution, type Store } from './model.ts';

export function requireBookmark(
    store: Store,
    query: string,
): Extract<Resolution, { kind: 'ok' }> {
    const res = resolveQuery(store, query);
    if (res.kind === 'ok') return res;
    if (res.kind === 'ambiguous') {
        throw new UserError(
            `"${res.query}" matches ${res.matches.length} bookmarks: ${res.matches.join(', ')}`,
        );
    }
    const known = entries(store);
    throw new UserError(
        known.length === 0
            ? `no bookmark "${res.query}" — you have none yet, try \`b add\``
            : `no bookmark "${res.query}" — try \`b ls\``,
    );
}

/**
 * Look up a bookmark by its exact name, for commands that change or delete it.
 * Near misses are named, but never acted on.
 */
export function requireExact(store: Store, name: string): string {
    if (Object.hasOwn(store.bookmarks, name)) return name;
    const res = resolveQuery(store, name);
    if (res.kind === 'ok' && res.sub === '') {
        throw new UserError(
            `no bookmark "${name}" — did you mean "${res.name}"?`,
        );
    }
    if (res.kind === 'ambiguous' && !name.includes('/')) {
        throw new UserError(
            `no bookmark "${name}" — did you mean one of: ${res.matches.join(', ')}?`,
        );
    }
    throw new UserError(`no bookmark "${name}"`);
}
