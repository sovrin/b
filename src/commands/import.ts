import type { BookmarkRepository } from '../bookmarks/repository.ts';

import { validateName } from '../bookmarks/model.ts';
import { UserError } from '../errors.ts';
import { bold, cyan, dim, info, ok, warn } from '../output.ts';
import { absPath, marksDir, tildify } from '../paths.ts';
import { takeFlag } from './args.ts';

/**
 * Import the older cd_mark store: one symlink per bookmark under ~/.marks.
 */
export function importBookmarks(
    args: string[],
    repository: BookmarkRepository,
): number {
    const force = takeFlag(args, '--force', '-f');
    const dir = args[0] === undefined ? marksDir() : absPath(args[0]);

    let names: string[];
    try {
        names = [...Deno.readDirSync(dir)]
            .map((e) => {
                return e.name;
            })
            .sort();
    } catch {
        throw new UserError(`nothing to import from ${tildify(dir)}`);
    }
    if (names.length === 0) throw new UserError(`${tildify(dir)} is empty`);

    const store = repository.load();
    let added = 0;
    let skipped = 0;
    for (const name of names) {
        const link = `${dir}/${name}`;
        let target: string;
        try {
            target = absPath(Deno.readLinkSync(link), dir);
        } catch {
            try {
                if (!Deno.statSync(link).isDirectory) continue;
                target = link;
            } catch {
                continue;
            }
        }
        if (validateName(name) !== null) {
            warn(`skipped ${bold(name)} — ${validateName(name)}`);
            skipped++;
            continue;
        }
        const prev = store.bookmarks[name];
        if (prev && prev.path !== target && !force) {
            warn(
                `kept ${bold(name)} → ${tildify(prev.path)} ${dim('(--force to overwrite)')}`,
            );
            skipped++;
            continue;
        }
        store.bookmarks[name] = {
            path: target,
            created: prev?.created ?? new Date().toISOString(),
            hits: prev?.hits ?? 0,
        };
        added++;
        ok(`${bold(name)} → ${cyan(tildify(target))}`);
    }
    repository.save(store);
    info('');
    info(
        `Imported ${added} from ${cyan(tildify(dir))}${skipped ? `, skipped ${skipped}` : ''}.`,
    );
    return 0;
}
