import { UserError } from '../errors.ts';
import { dim, info, warn } from '../output.ts';

const SHELL_HEADER = '\x01b2';

export type ShellAction = {
    /** Directory to move to. */
    cd?: string;
    /** Context to activate; null clears it; undefined leaves it alone. */
    ctx?: string | null;
    /** Root of the context being activated. */
    root?: string;
};

function assertDir(path: string): void {
    try {
        if (!Deno.statSync(path).isDirectory)
            throw new UserError(`not a directory: ${path}`);
    } catch (err) {
        if (err instanceof Deno.errors.NotFound) {
            throw new UserError(`path no longer exists: ${path}`);
        }
        throw err;
    }
}

/**
 * Hand the wrapper a directive block, or degrade to printing the path when the
 * shell integration is not in play.
 */
export function emitShell(action: ShellAction, fromShell: boolean): number {
    if (action.cd !== undefined) assertDir(action.cd);

    if (!fromShell) {
        if (action.cd !== undefined) console.log(action.cd);
        warn('shell integration is not active, so nothing moved');
        info(`  ${dim('run `b setup` (once), then `exec zsh`')}`);
        return action.cd === undefined ? 1 : 0;
    }

    const lines = [SHELL_HEADER];
    if (action.cd !== undefined) lines.push(`cd:${action.cd}`);
    if (action.ctx !== undefined) lines.push(`ctx:${action.ctx ?? ''}`);
    if (action.root !== undefined) lines.push(`root:${action.root}`);
    Deno.stdout.writeSync(new TextEncoder().encode(lines.join('\n')));
    return 0;
}
