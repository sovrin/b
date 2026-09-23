import type { BookmarkRepository } from '../bookmarks/repository.ts';
import type { ShellAction } from '../shell/protocol.ts';

import { type Store, underRoot } from '../bookmarks/model.ts';
import { requireBookmark } from '../bookmarks/resolve.ts';
import { UserError } from '../errors.ts';
import { bold, info, ok } from '../output.ts';

type NavigationContexts = {
    activeCtx(): string | null;
    previousCtx(): string | null;
    rememberedCwd(name: string, root: string): string | null;
    pruneRecent(store: Store): string[];
    pushRecent(name: string): void;
};

export function createNavigationCommands(
    repository: BookmarkRepository,
    contexts: NavigationContexts,
    emit: (action: ShellAction) => number,
) {
    /**
     * Activate a context: move to where it was last left, or to the bookmark root
     * on a first visit or when the query names a subdirectory.
     */
    function cmdEnter(store: Store, query: string): number {
        const res = requireBookmark(store, query);

        const root = store.bookmarks[res.name]!.path;
        let target: string;
        if (res.sub !== '') {
            // The context would end the moment the shell arrived, so refuse up front.
            if (!underRoot(res.path, root)) {
                throw new UserError(
                    `"${query}" leads outside ${bold(res.name)} — use \`cd\` for that`,
                );
            }
            target = res.path;
        } else if (contexts.activeCtx() === res.name) {
            // Already here: treat a repeat as "go home".
            target = root;
        } else {
            target = contexts.rememberedCwd(res.name, root) ?? root;
        }

        const bm = store.bookmarks[res.name]!;
        bm.hits += 1;
        try {
            repository.save(store);
        } catch {
            /* a read-only config must not block the jump */
        }
        contexts.pushRecent(res.name);

        return emit({ cd: target, ctx: res.name, root });
    }

    /** `b =` — back to the context before this one. */
    function cmdSwitchBack(store: Store): number {
        const current = contexts.activeCtx();
        let name = contexts.previousCtx();
        if (name === null || !Object.hasOwn(store.bookmarks, name)) {
            // Fresh shell: fall back to the most recent context used anywhere.
            name =
                contexts.pruneRecent(store).find((n) => {
                    return n !== current;
                }) ?? null;
        }
        if (name === null)
            throw new UserError('no previous context to switch back to');
        if (name === current)
            throw new UserError(`already in context ${bold(name)}`);
        return cmdEnter(store, name);
    }

    /** `b off` — leave the current context without moving. */
    function cmdOff(): number {
        const current = contexts.activeCtx();
        if (current === null) {
            info('no active context');
            return 0;
        }
        const code = emit({ ctx: null });
        if (code === 0) ok(`left context ${bold(current)}`);
        return code;
    }

    return {
        enter(query: string): number {
            return cmdEnter(repository.load(), query);
        },
        switchBack(): number {
            return cmdSwitchBack(repository.load());
        },
        off: cmdOff,
    };
}
