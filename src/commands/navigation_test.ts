import { deepStrictEqual, strictEqual, throws } from 'node:assert/strict';

import type { Store } from '../bookmarks/model.ts';
import type { ShellAction } from '../shell/protocol.ts';

import { createNavigationCommands } from './navigation.ts';

function fixture() {
    const store: Store = {
        version: 1,
        bookmarks: {
            project: { path: '/project', hits: 0 },
            other: { path: '/other', hits: 2 },
        },
    };
    const actions: ShellAction[] = [];
    const recent: string[] = [];
    const state = {
        active: null as string | null,
        previous: null as string | null,
        readOnly: false,
    };
    let saves = 0;
    const commands = createNavigationCommands(
        {
            load: () => {
                return store;
            },
            save: () => {
                if (state.readOnly) throw new Error('read only');
                saves++;
            },
        },
        {
            activeCtx: () => {
                return state.active;
            },
            previousCtx: () => {
                return state.previous;
            },
            rememberedCwd: (_name, root) => {
                return `${root}/src`;
            },
            pruneRecent: () => {
                return recent;
            },
            pushRecent: (name) => {
                recent.unshift(name);
            },
        },
        (action) => {
            actions.push(action);
            return 0;
        },
    );
    return {
        commands,
        store,
        actions,
        recent,
        state,
        saves: () => {
            return saves;
        },
    };
}

Deno.test('enter resumes a context, returns home on repeat, and honors explicit subpaths', () => {
    const f = fixture();
    strictEqual(f.commands.enter('proj'), 0);
    f.state.active = 'project';
    f.commands.enter('project');
    f.commands.enter('project/lib');
    deepStrictEqual(f.actions, [
        { cd: '/project/src', ctx: 'project', root: '/project' },
        { cd: '/project', ctx: 'project', root: '/project' },
        { cd: '/project/lib', ctx: 'project', root: '/project' },
    ]);
    strictEqual(f.store.bookmarks.project.hits, 3);
    strictEqual(f.saves(), 3);
});

Deno.test('a failed hit-count write does not block navigation or recent history', () => {
    const f = fixture();
    f.state.readOnly = true;
    strictEqual(f.commands.enter('project'), 0);
    strictEqual(f.actions.length, 1);
    deepStrictEqual(f.recent, ['project']);
});

Deno.test('switch back prefers the shell previous context and falls back to recent contexts', () => {
    const f = fixture();
    f.state.active = 'project';
    f.state.previous = 'other';
    f.commands.switchBack();
    strictEqual(f.actions.at(-1)?.ctx, 'other');
    f.state.previous = 'deleted';
    f.recent.splice(0, f.recent.length, 'project', 'other');
    f.commands.switchBack();
    strictEqual(f.actions.at(-1)?.ctx, 'other');
    f.recent.length = 0;
    throws(() => {
        f.commands.switchBack();
    }, /no previous context/);
});

Deno.test('missing or ambiguous queries do not update state or emit shell directives', () => {
    const f = fixture();
    throws(() => {
        f.commands.enter('missing');
    }, /no bookmark/);
    throws(() => {
        f.commands.enter('');
    }, /matches 2 bookmarks/);
    throws(() => {
        f.commands.enter('project/../other');
    }, /leads outside/);
    deepStrictEqual(f.actions, []);
    deepStrictEqual(f.recent, []);
    strictEqual(f.saves(), 0);
});

Deno.test('off clears the context without moving', () => {
    const f = fixture();
    f.state.active = 'project';
    strictEqual(f.commands.off(), 0);
    deepStrictEqual(f.actions, [{ ctx: null }]);
    strictEqual(f.saves(), 0);
});
