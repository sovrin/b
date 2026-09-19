import { join, resolve } from 'node:path';

import { entries, resolveQuery, type Store } from './bookmarks/model.ts';
import { load } from './bookmarks/repository.ts';
import { tildify } from './paths.ts';

/**
 * Machine-readable completion backend. The shell script stays dumb: it forwards
 * the cursor position plus every word, and renders whatever comes back.
 *
 *   @mode:describe        candidates are value<TAB>description, grouped
 *   @mode:paths           candidates are full replacement words, no trailing space
 *   @mode:dirs            let the shell complete directories itself
 *   @mode:none            nothing to offer
 *   @group:<tag>:<label>  starts a group (describe mode only)
 */

type Cand = [value: string, description: string];

const SUBCOMMANDS: Cand[] = [
    ['=', 'switch back to the previous context'],
    ['off', 'leave the current context'],
    ['add', 'bookmark a directory (defaults to $PWD)'],
    ['rm', 'delete a bookmark'],
    ['mv', 'rename a bookmark'],
    ['ls', 'list bookmarks'],
    ['import', 'import bookmarks from ~/.marks'],
    ['path', "print a bookmark's path"],
    ['setup', 'install/repair the zsh integration'],
    ['doctor', 'check the installation'],
    ['starship', 'print the starship prompt segment'],
    ['completions', 'print the completion script'],
    ['help', 'show usage'],
];

/** Subcommands that take a bookmark name as their first argument. */
const TAKES_NAME = new Set([
    'rm',
    'remove',
    'del',
    'mv',
    'rename',
    'path',
    'get',
]);

const FLAGS: Record<string, Cand[]> = {
    add: [['--force', 'overwrite an existing bookmark']],
    ls: [['--paths', 'print bare paths only']],
    rm: [],
    setup: [
        ['--starship', "add the context segment to starship's config"],
        ['--force', 'rewrite files that already exist'],
        ['--dry-run', 'show what would change'],
        ['--remove', 'undo the shell integration'],
    ],
};

const GLOBAL_FLAGS: Cand[] = [
    ['--help', 'show usage'],
    ['--version', 'print version'],
];

function bookmarkCands(store: Store): Cand[] {
    return entries(store).map(([name, bm]) => {
        return [name, tildify(bm.path)];
    });
}

/** Directories under `base` whose name starts with `partial`. */
function listDirs(base: string, partial: string): string[] {
    const out: string[] = [];
    let it: Iterable<Deno.DirEntry>;
    try {
        it = Deno.readDirSync(base);
    } catch {
        return out;
    }
    const wantHidden = partial.startsWith('.');
    for (const e of it) {
        if (!e.isDirectory && !e.isSymlink) continue;
        if (!wantHidden && e.name.startsWith('.')) continue;
        if (!e.name.startsWith(partial)) continue;
        if (e.isSymlink) {
            try {
                if (!Deno.statSync(join(base, e.name)).isDirectory) continue;
            } catch {
                continue;
            }
        }
        out.push(e.name);
    }
    return out.sort();
}

/**
 * Complete `<bookmark>/<subpath>` against the real filesystem, keeping the
 * bookmark name exactly as the user typed it so the replacement stays prefixed.
 */
function subpathCands(
    store: Store,
    word: string,
): { strip: number; tails: string[] } {
    const slash = word.indexOf('/');
    const head = word.slice(0, slash);
    const sub = word.slice(slash + 1);

    const res = resolveQuery(store, head);
    if (res.kind !== 'ok') return { strip: 0, tails: [] };

    const lastSlash = sub.lastIndexOf('/');
    const dirPart = lastSlash === -1 ? '' : sub.slice(0, lastSlash + 1);
    const partial = lastSlash === -1 ? sub : sub.slice(lastSlash + 1);

    const base = resolve(res.path, dirPart);
    const settled = `${head}/${dirPart}`;
    return {
        strip: [...settled].length,
        tails: listDirs(base, partial).map((n) => {
            return `${n}/`;
        }),
    };
}

function emit(
    mode: string,
    groups: [tag: string, label: string, cands: Cand[]][],
): string[] {
    const lines = [`@mode:${mode}`];
    for (const [tag, label, cands] of groups) {
        if (cands.length === 0) continue;
        lines.push(`@group:${tag}:${label}`);
        for (const [v, d] of cands) lines.push(`${v}\t${d}`);
    }
    return lines;
}

function paths(res: { strip: number; tails: string[] }): string[] {
    if (res.tails.length === 0) return ['@mode:none'];
    return ['@mode:paths', `@strip:${res.strip}`, ...res.tails];
}

/**
 * @param current 1-based index (zsh $CURRENT) of the word being completed
 * @param words   every word on the line, words[0] is the command itself
 */
export function complete(current: number, words: string[]): string[] {
    let store: Store;
    try {
        store = load();
    } catch {
        store = { version: 1, bookmarks: {} };
    }

    const idx = current - 1; // 0-based index into words
    const word = words[idx] ?? '';
    const before = words.slice(1, Math.max(idx, 1)).filter((w) => {
        return w.length > 0;
    });
    const sub = before.find((w) => {
        return !w.startsWith('-');
    });

    // Flags, wherever the cursor is.
    if (word.startsWith('-')) {
        const local = sub === undefined ? [] : (FLAGS[sub] ?? []);
        return emit('describe', [
            ['options', 'option', [...local, ...GLOBAL_FLAGS]],
        ]);
    }

    // First positional: a bookmark (possibly with a subpath) or a subcommand.
    if (sub === undefined) {
        if (word.includes('/')) return paths(subpathCands(store, word));
        return emit('describe', [
            ['bookmarks', 'bookmark', bookmarkCands(store)],
            ['commands', 'command', SUBCOMMANDS],
        ]);
    }

    const pos = before.filter((w) => {
        return !w.startsWith('-');
    }).length; // 1 == completing arg after subcommand

    if (TAKES_NAME.has(sub) && pos === 1) {
        return emit('describe', [
            ['bookmarks', 'bookmark', bookmarkCands(store)],
        ]);
    }

    if (sub === 'add' || sub === 'a') {
        if (pos === 1) {
            const suggestion = Deno.cwd().split('/').pop() ?? '';
            const cands: Cand[] =
                suggestion && !Object.hasOwn(store.bookmarks, suggestion)
                    ? [[suggestion, 'name of the current directory']]
                    : [];
            return emit('describe', [['bookmarks', 'new name', cands]]);
        }
        if (pos === 2) return ['@mode:dirs'];
    }

    if (sub === 'import' && pos === 1) return ['@mode:dirs'];

    if (sub === 'completions') {
        return emit('describe', [
            ['shells', 'shell', [['zsh', 'zsh completion script']]],
        ]);
    }

    // `b <bookmark> <TAB>` — a bookmark takes no further arguments.
    return ['@mode:none'];
}
