import { basename } from 'node:path';

import type { BookmarkRepository } from '../bookmarks/repository.ts';

import { entries, resolveQuery, validateName } from '../bookmarks/model.ts';
import { requireBookmark } from '../bookmarks/resolve.ts';
import { UserError } from '../errors.ts';
import { bold, cyan, dim, green, info, ok, red, yellow } from '../output.ts';
import { absPath, tildify } from '../paths.ts';
import { takeFlag } from './args.ts';

type BookmarkContexts = {
    forgetCtx(name: string): void;
    renameCtx(from: string, to: string): void;
    activeCtx(): string | null;
    rememberedCwd(name: string, root: string): string | null;
};

export function createBookmarkCommands(
    repository: BookmarkRepository,
    contexts: BookmarkContexts,
) {
    function cmdAdd(args: string[]): number {
        const force = takeFlag(args, '--force', '-f');
        const store = repository.load();
        const path = absPath(args[1] ?? '.');
        const name = args[0] ?? basename(path);

        const bad = validateName(name);
        if (bad) throw new UserError(bad);
        if (!Deno.statSync(path).isDirectory)
            throw new UserError(`not a directory: ${path}`);

        const prev = store.bookmarks[name];
        if (prev && prev.path !== path && !force) {
            throw new UserError(
                `"${name}" already points at ${tildify(prev.path)} — pass --force to overwrite`,
            );
        }

        store.bookmarks[name] = {
            path,
            created: prev?.created ?? new Date().toISOString(),
            hits: prev?.hits ?? 0,
        };
        repository.save(store);
        ok(`${bold(name)} → ${cyan(tildify(path))}`);
        return 0;
    }

    function cmdRm(args: string[]): number {
        if (args.length === 0) throw new UserError('usage: b rm <name>...');
        const store = repository.load();
        for (const q of args) {
            const res = resolveQuery(store, q.replace(/\/+$/, ''));
            if (res.kind !== 'ok' || res.sub !== '') {
                throw new UserError(`no bookmark "${q}"`);
            }
            delete store.bookmarks[res.name];
            contexts.forgetCtx(res.name);
            ok(`removed ${bold(res.name)}`);
        }
        repository.save(store);
        return 0;
    }

    function cmdMv(args: string[]): number {
        const [from, to] = args;
        if (!from || !to) throw new UserError('usage: b mv <old> <new>');
        const store = repository.load();
        const res = resolveQuery(store, from.replace(/\/+$/, ''));
        if (res.kind !== 'ok' || res.sub !== '')
            throw new UserError(`no bookmark "${from}"`);
        const bad = validateName(to);
        if (bad) throw new UserError(bad);
        if (Object.hasOwn(store.bookmarks, to))
            throw new UserError(`"${to}" already exists`);
        store.bookmarks[to] = store.bookmarks[res.name]!;
        delete store.bookmarks[res.name];
        contexts.renameCtx(res.name, to);
        repository.save(store);
        ok(`${bold(res.name)} → ${bold(to)}`);
        return 0;
    }

    function cmdLs(args: string[]): number {
        const bare = takeFlag(args, '--paths', '-p');
        const store = repository.load();
        const rows = entries(store);
        if (rows.length === 0) {
            info(`No bookmarks yet. ${dim('cd somewhere, then `b add`.')}`);
            return 0;
        }
        if (bare) {
            for (const [, bm] of rows) console.log(bm.path);
            return 0;
        }
        const width = Math.max(
            ...rows.map(([n]) => {
                return n.length;
            }),
        );
        const current = contexts.activeCtx();
        for (const [name, bm] of rows) {
            let missing = false;
            try {
                missing = !Deno.statSync(bm.path).isDirectory;
            } catch {
                missing = true;
            }
            const marker = name === current ? green('▶') : ' ';
            const label = bold(name.padEnd(width));
            const path = missing
                ? `${red(tildify(bm.path))} ${yellow('(missing)')}`
                : cyan(tildify(bm.path));
            // Only worth showing when the context is parked below its own root.
            const parked = contexts.rememberedCwd(name, bm.path);
            const at =
                parked !== null && parked !== bm.path
                    ? ` ${dim(`⌂ ${parked.slice(bm.path.length + 1)}`)}`
                    : '';
            console.log(`${marker} ${label}  ${path}${at}`);
        }
        return 0;
    }

    function cmdPath(args: string[]): number {
        if (!args[0]) throw new UserError('usage: b path <name>');
        console.log(requireBookmark(repository.load(), args[0]).path);
        return 0;
    }
    return {
        add: cmdAdd,
        remove: cmdRm,
        rename: cmdMv,
        list: cmdLs,
        path: cmdPath,
    };
}
