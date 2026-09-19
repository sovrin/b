import { join } from 'node:path';

import { UserError } from '../errors.ts';
import { dim, info } from '../output.ts';
import { configDir, homedir, starshipConfig, zshrc } from '../paths.ts';

export function denoBinDir(): string {
    const root = Deno.env.get('DENO_INSTALL_ROOT');
    return join(
        root && root.length > 0 ? root : join(homedir(), '.deno'),
        'bin',
    );
}

export function onPath(dir: string): boolean {
    return (Deno.env.get('PATH') ?? '').split(':').includes(dir);
}

/** Reinstall the global shim so `command b` exists and points at this source. */
export async function installBinary(
    entry: string,
    dryRun: boolean,
): Promise<string> {
    const write = `--allow-write=${configDir()},${zshrc()},${starshipConfig()}`;
    const args = [
        'install',
        '-g',
        '-f',
        '-q',
        '--allow-read',
        write,
        '--allow-env',
        '--allow-run=deno',
        '-n',
        'b',
        entry,
    ];
    if (dryRun) {
        info(`  ${dim(`would run: deno ${args.join(' ')}`)}`);
        return join(denoBinDir(), 'b');
    }
    // Spawn by name, not Deno.execPath(): --allow-run=deno matches the name, and
    // the resolved binary can be a symlink the allowlist would reject.
    const status = await new Deno.Command('deno', {
        args,
        stdout: 'inherit',
        stderr: 'inherit',
    }).output();
    if (!status.success) {
        throw new UserError('`deno install -g` failed — see the output above');
    }
    return join(denoBinDir(), 'b');
}
