import { strictEqual } from 'node:assert/strict';

import { currentBlock, replaceBlock } from './rc.ts';

const block =
    '# >>> b (path bookmarks) >>>\nsource init.zsh\n# <<< b (path bookmarks) <<<';

Deno.test('managed rc blocks are idempotent and preserve surrounding configuration', () => {
    const original = 'export EDITOR=vim\n';
    const installed = replaceBlock(original, block);
    strictEqual(currentBlock(installed), block);
    strictEqual(replaceBlock(installed, block), installed);
    const withTail = `${installed}alias ll="ls -l"\n`;
    strictEqual(replaceBlock(withTail, null), `${original}alias ll="ls -l"\n`);
    strictEqual(replaceBlock(original, null), original);
});

Deno.test('an incomplete managed block can be repaired', () => {
    const partial = 'before\n# >>> b (path bookmarks) >>>\nbroken';
    strictEqual(replaceBlock(partial, block), `before\n${block}\n`);
});
