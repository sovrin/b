import { deepStrictEqual, strictEqual, throws } from 'node:assert/strict';

import type { Store } from '../bookmarks/model.ts';
import type { ShellAction } from '../shell/protocol.ts';

import { createBookmarkCommands } from './bookmarks.ts';

function fixture() {
    const store: Store = {
        version: 1,
        bookmarks: {
            project: { path: '/project', hits: 0 },
            prototype: { path: '/prototype', hits: 0 },
            other: { path: '/other', hits: 0 },
        },
    };
    const synced: ShellAction[] = [];
    const forgotten: string[] = [];
    const renamed: [string, string][] = [];
    const state = {
        active: null as string | null,
        previous: null as string | null,
    };
    let saves = 0;
    const commands = createBookmarkCommands(
        {
            load: () => {
                return store;
            },
            save: () => {
                saves++;
            },
        },
        {
            forgetCtx: (name) => {
                forgotten.push(name);
            },
            renameCtx: (from, to) => {
                renamed.push([from, to]);
            },
            activeCtx: () => {
                return state.active;
            },
            previousCtx: () => {
                return state.previous;
            },
            rememberedCwd: () => {
                return null;
            },
        },
        (action) => {
            synced.push(action);
        },
    );
    return {
        commands,
        store,
        synced,
        forgotten,
        renamed,
        state,
        saves: () => {
            return saves;
        },
    };
}

Deno.test('rm and mv only act on exact names and suggest near misses', () => {
    const f = fixture();
    throws(() => {
        f.commands.remove(['oth']);
    }, /no bookmark "oth" — did you mean "other"\?/);
    throws(() => {
        f.commands.remove(['pro']);
    }, /did you mean one of: project, prototype\?/);
    throws(() => {
        f.commands.rename(['oth', 'x']);
    }, /did you mean "other"/);
    deepStrictEqual(Object.keys(f.store.bookmarks).sort(), [
        'other',
        'project',
        'prototype',
    ]);
    strictEqual(f.saves(), 0);
    strictEqual(f.commands.remove(['other/']), 0);
    strictEqual(Object.hasOwn(f.store.bookmarks, 'other'), false);
});

Deno.test('rm resolves every name before removing anything', () => {
    const f = fixture();
    throws(() => {
        f.commands.remove(['project', 'nosuch']);
    }, /no bookmark "nosuch"/);
    strictEqual(Object.hasOwn(f.store.bookmarks, 'project'), true);
    deepStrictEqual(f.forgotten, []);
    strictEqual(f.saves(), 0);
    strictEqual(f.commands.remove(['project', 'project']), 0);
    deepStrictEqual(f.forgotten, ['project']);
});

Deno.test('rm clears the shell context when it removes the active or previous one', () => {
    const f = fixture();
    f.state.active = 'other';
    f.commands.remove(['project']);
    deepStrictEqual(f.synced, []);
    f.state.previous = 'prototype';
    f.commands.remove(['other']);
    deepStrictEqual(f.synced, [{ ctx: null, prev: 'prototype' }]);
    f.state.active = null;
    f.commands.remove(['prototype']);
    deepStrictEqual(f.synced.at(-1), { prev: null });
});

Deno.test('mv carries the active or previous shell context over to the new name', () => {
    const f = fixture();
    f.state.active = 'project';
    f.state.previous = 'other';
    f.commands.rename(['project', 'renamed']);
    deepStrictEqual(f.renamed, [['project', 'renamed']]);
    deepStrictEqual(f.synced, [
        { ctx: 'renamed', root: '/project', prev: 'other' },
    ]);
    f.state.active = 'renamed';
    f.commands.rename(['other', 'elsewhere']);
    deepStrictEqual(f.synced.at(-1), { prev: 'elsewhere' });
    f.commands.rename(['prototype', 'proto']);
    strictEqual(f.synced.length, 2);
});
