import { deepStrictEqual, strictEqual } from 'node:assert/strict';

import { resolveQuery, type Store, underRoot, validateName } from './model.ts';

Deno.test('resolution prefers exact names, then prefixes, then substrings', () => {
    const store: Store = {
        version: 1,
        bookmarks: {
            app: { path: '/app', hits: 0 },
            apple: { path: '/apple', hits: 0 },
            pineapple: { path: '/pineapple', hits: 0 },
        },
    };
    deepStrictEqual(resolveQuery(store, 'app/src'), {
        kind: 'ok',
        name: 'app',
        path: '/app/src',
        sub: 'src',
    });
    deepStrictEqual(resolveQuery(store, 'APP'), {
        kind: 'ambiguous',
        query: 'APP',
        matches: ['app', 'apple'],
    });
    strictEqual(resolveQuery(store, 'PINE').kind, 'ok');
    strictEqual(resolveQuery(store, 'neap').kind, 'ok');
    deepStrictEqual(resolveQuery(store, 'missing'), {
        kind: 'missing',
        query: 'missing',
    });
});

Deno.test('bookmark names reject commands and unsafe context filenames', () => {
    for (const name of [
        'add',
        'setup',
        '..',
        '.',
        'a/b',
        '-flag',
        'two words',
        '',
    ]) {
        strictEqual(typeof validateName(name), 'string');
    }
    strictEqual(validateName('my-project_2.0'), null);
});

Deno.test('underRoot matches the root and its subtree, including a root of /', () => {
    strictEqual(underRoot('/project', '/project'), true);
    strictEqual(underRoot('/project/src', '/project'), true);
    strictEqual(underRoot('/project2', '/project'), false);
    strictEqual(underRoot('/', '/'), true);
    strictEqual(underRoot('/etc', '/'), true);
});
