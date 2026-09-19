import { join } from 'node:path';

import { bold, cyan, dim, fail, info, ok } from '../output.ts';
import { bookmarksFile, initFile, tildify, zshrc } from '../paths.ts';
import { denoBinDir, onPath } from './binary.ts';
import { readRc } from './rc.ts';

function exists(p: string): boolean {
    try {
        Deno.statSync(p);
        return true;
    } catch {
        return false;
    }
}

export function doctor(): number {
    info(bold('b doctor'));
    info('');
    let problems = 0;
    const check = (good: boolean, label: string, hint?: string) => {
        if (good) {
            ok(label);
        } else {
            fail(label);
            if (hint) info(`  ${dim(hint)}`);
            problems++;
        }
    };

    const binDir = denoBinDir();
    const binPath = join(binDir, 'b');
    check(exists(binPath), `command shim ${tildify(binPath)}`, 'run `b setup`');
    check(
        onPath(binDir),
        `${tildify(binDir)} on $PATH`,
        'run `b setup`, then `exec zsh`',
    );
    check(
        exists(initFile()),
        `shell integration ${tildify(initFile())}`,
        'run `b setup`',
    );

    const rc = readRc();
    check(
        rc.hasBlock,
        `${tildify(zshrc())} sources the integration`,
        'run `b setup`',
    );

    const ctx = Deno.env.get('B_CTX');
    const wrapped = Deno.env.get('B_FROM_SHELL') === '1';
    check(
        wrapped,
        'shell wrapper active (b can change your directory)',
        'run `exec zsh` — without the wrapper b can only print paths',
    );

    const store = exists(bookmarksFile());
    info(
        store
            ? `${dim('bookmarks:')} ${cyan(tildify(bookmarksFile()))}`
            : `${dim('bookmarks:')} none yet ${dim('(b add)')}`,
    );
    info(
        ctx !== undefined && ctx.length > 0
            ? `${dim('context:')} ${cyan(ctx)}`
            : `${dim('context:')} none active`,
    );

    info('');
    if (problems === 0) info(`${bold('All good.')}`);
    else info(`${problems} problem${problems === 1 ? '' : 's'} found.`);
    return problems === 0 ? 0 : 1;
}
