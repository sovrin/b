import { absPath } from '../paths.ts';

/** One entry of the older cd_mark store, and why it cannot be imported, if it cannot. */
export type Mark = {
    name: string;
    target: string;
    problem: 'missing' | 'not a directory' | null;
};

/**
 * Read a cd_mark directory: one symlink per bookmark, though a plain directory
 * counts too. Other entries are not marks. Throws when `dir` is unreadable.
 */
export function readMarks(dir: string): Mark[] {
    const marks: Mark[] = [];
    const names = [...Deno.readDirSync(dir)]
        .map((e) => {
            return e.name;
        })
        .sort();
    for (const name of names) {
        const link = `${dir}/${name}`;
        let target: string;
        try {
            target = absPath(Deno.readLinkSync(link), dir);
        } catch {
            try {
                if (!Deno.statSync(link).isDirectory) continue;
            } catch {
                continue;
            }
            marks.push({ name, target: link, problem: null });
            continue;
        }
        let problem: Mark['problem'] = null;
        try {
            if (!Deno.statSync(target).isDirectory) problem = 'not a directory';
        } catch {
            problem = 'missing';
        }
        marks.push({ name, target, problem });
    }
    return marks;
}
