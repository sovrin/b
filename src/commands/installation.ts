import { UserError } from '../errors.ts';
import { takeFlag } from './args.ts';

export async function setupCommand(args: string[]): Promise<number> {
    const { setup } = await import('../setup/mod.ts');
    return await setup({
        dryRun: takeFlag(args, '--dry-run', '-n'),
        remove: takeFlag(args, '--remove', '--uninstall'),
        force: takeFlag(args, '--force', '-f'),
        starship: takeFlag(args, '--starship'),
    });
}

export async function doctorCommand(): Promise<number> {
    const { doctor } = await import('../setup/doctor.ts');
    return doctor();
}

export async function starshipCommand(): Promise<number> {
    const { starshipSnippet } = await import('../shell/assets.ts');
    console.log(starshipSnippet().trimEnd());
    return 0;
}

export async function completionsCommand(args: string[]): Promise<number> {
    const shell = args[0] ?? 'zsh';
    if (shell !== 'zsh')
        throw new UserError(`only zsh is supported so far (got "${shell}")`);
    const { shellInit } = await import('../shell/assets.ts');
    console.log(shellInit());
    return 0;
}
