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
