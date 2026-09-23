import { fileURLToPath } from 'node:url';

import { readMarks } from '../bookmarks/marks.ts';
import { validateName } from '../bookmarks/model.ts';
import { load } from '../bookmarks/repository.ts';
import { UserError } from '../errors.ts';
import { bold, cyan, dim, info, ok, warn } from '../output.ts';
import {
    bookmarksFile,
    configDir,
    initFile,
    marksDir,
    tildify,
    zshrc,
} from '../paths.ts';
import { shellInit } from '../shell/assets.ts';
import { denoBinDir, installBinary, onPath } from './binary.ts';
import { currentBlock, rcBlock, readRc, replaceBlock } from './rc.ts';
import { patchStarship } from './starship.ts';

export type SetupOptions = {
    dryRun: boolean;
    remove: boolean;
    force: boolean;
    starship: boolean;
};

export async function setup(opts: SetupOptions): Promise<number> {
    if (Deno.build.os === 'windows')
        throw new UserError('only zsh on macOS/Linux is supported so far');

    const rcPath = zshrc();

    if (opts.remove) {
        const rc = readRc();
        if (!rc.hasBlock) {
            warn(`no b block found in ${tildify(rcPath)} — nothing to remove`);
        } else if (opts.dryRun) {
            info(
                `  ${dim(`would remove the b block from ${tildify(rcPath)}`)}`,
            );
        } else {
            Deno.writeTextFileSync(rcPath, replaceBlock(rc.text, null));
            ok(`removed the b block from ${tildify(rcPath)}`);
        }
        info('');
        info(`Bookmarks are kept at ${cyan(tildify(bookmarksFile()))}.`);
        info(`Remove the command with ${cyan('deno uninstall -g b')}.`);
        return 0;
    }

    info(bold('Setting up b for zsh'));
    info('');

    // 1. global shim
    const entry = fileURLToPath(new URL('../cli.ts', import.meta.url));
    const binPath = await installBinary(entry, opts.dryRun);
    ok(`command installed at ${cyan(tildify(binPath))}`);
    info(`  ${dim(`runs ${tildify(entry)} — keep this project on disk`)}`);

    // 2. shell integration file
    const init = initFile();
    if (opts.dryRun) {
        info(`  ${dim(`would write ${tildify(init)}`)}`);
    } else {
        Deno.mkdirSync(configDir(), { recursive: true });
        Deno.writeTextFileSync(init, shellInit());
    }
    ok(`shell integration written to ${cyan(tildify(init))}`);

    // 3. ~/.zshrc hook
    const binDir = denoBinDir();
    const rc = readRc();
    // Once the block puts binDir on $PATH, $PATH contains it on every later run —
    // so keep the line rather than "helpfully" dropping it again.
    const needPath =
        !onPath(binDir) || /^export PATH=/m.test(currentBlock(rc.text));
    const block = rcBlock(needPath, binDir);
    const next = replaceBlock(rc.text, block);

    if (next === rc.text && !opts.force) {
        ok(`${cyan(tildify(rcPath))} already sources it`);
    } else if (opts.dryRun) {
        info(
            `  ${dim(`would ${rc.hasBlock ? 'update' : 'append'} the b block in ${tildify(rcPath)}`)}`,
        );
        for (const line of block.split('\n')) info(`  ${dim(`| ${line}`)}`);
    } else {
        Deno.writeTextFileSync(rcPath, next);
        ok(
            `${rc.hasBlock ? 'updated' : 'appended'} the b block in ${cyan(tildify(rcPath))}`,
        );
    }
    if (needPath)
        info(`  ${dim(`the block also puts ${tildify(binDir)} on $PATH`)}`);

    // 4. optional starship prompt segment
    if (opts.starship) patchStarship(opts.dryRun);

    info('');
    if (opts.dryRun) {
        info(`Dry run — nothing changed. Re-run ${cyan('b setup')} to apply.`);
        return 0;
    }
    info(bold('One last step:'));
    info(`  ${cyan('exec zsh')}   ${dim('# reload this shell')}`);
    info('');
    info(`Then try: ${cyan('b add')} here, ${cyan('b <TAB>')} to jump.`);
    // Only nag about the old cd_mark store while something importable is still missing.
    let pending = 0;
    try {
        const known = load().bookmarks;
        pending = readMarks(marksDir()).filter((m) => {
            return (
                m.problem === null &&
                validateName(m.name) === null &&
                !Object.hasOwn(known, m.name)
            );
        }).length;
    } catch {
        pending = 0;
    }
    if (pending > 0) {
        info(
            `${pending} bookmark${pending === 1 ? '' : 's'} in ${tildify(marksDir())} ` +
                `${pending === 1 ? 'is' : 'are'} not imported yet — run ${cyan('b import')}.`,
        );
    }
    return 0;
}
