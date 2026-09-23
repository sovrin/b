import { isAbsolute, join, resolve } from 'node:path';

import { UserError } from './errors.ts';

/** $HOME, read from the environment so no --allow-sys is needed. */
export function homedir(): string {
    const h = Deno.env.get('HOME');
    if (h === undefined || h.length === 0)
        throw new UserError('$HOME is not set');
    return h;
}

/** Root config dir: $XDG_CONFIG_HOME/b or ~/.config/b */
export function configDir(): string {
    const xdg = Deno.env.get('XDG_CONFIG_HOME');
    return xdg && xdg.length > 0
        ? join(xdg, 'b')
        : join(homedir(), '.config', 'b');
}

export function bookmarksFile(): string {
    return join(configDir(), 'bookmarks.json');
}

/** Shell integration file sourced from ~/.zshrc */
export function initFile(): string {
    return join(configDir(), 'init.zsh');
}

export function zshrc(): string {
    const zdotdir = Deno.env.get('ZDOTDIR');
    return join(zdotdir && zdotdir.length > 0 ? zdotdir : homedir(), '.zshrc');
}

/** Replace $HOME prefix with ~ for display. */
export function tildify(p: string): string {
    const h = homedir();
    return p === h ? '~' : p.startsWith(h + '/') ? '~' + p.slice(h.length) : p;
}

/** Expand a leading ~ back to $HOME. */
export function untildify(p: string): string {
    if (p === '~') return homedir();
    if (p.startsWith('~/')) return join(homedir(), p.slice(2));
    return p;
}

/** Where the older cd_mark helper kept its symlinks. */
export function marksDir(): string {
    const custom = Deno.env.get('MARKPATH');
    return custom && custom.length > 0 ? custom : join(homedir(), '.marks');
}

/** One file per context, holding its remembered cwd. */
export function ctxDir(): string {
    return join(configDir(), 'ctx');
}

export function ctxFile(name: string): string {
    return join(ctxDir(), name);
}

/** Most-recently-activated context names, newest first. */
export function recentFile(): string {
    return join(configDir(), 'recent');
}

export function starshipConfig(): string {
    const custom = Deno.env.get('STARSHIP_CONFIG');
    if (custom !== undefined && custom.length > 0) return custom;
    return join(homedir(), '.config', 'starship.toml');
}

/**
 * The working directory as the shell spells it. getcwd() resolves symlinks, but
 * zsh keeps the logical $PWD, and contexts compare against that.
 */
export function logicalCwd(): string {
    const physical = Deno.cwd();
    const pwd = Deno.env.get('PWD');
    if (pwd === undefined || !isAbsolute(pwd) || pwd === physical)
        return physical;
    try {
        const a = Deno.statSync(pwd);
        const b = Deno.statSync(physical);
        return a.dev === b.dev && a.ino !== null && a.ino === b.ino
            ? resolve(pwd)
            : physical;
    } catch {
        return physical;
    }
}

/** Turn a user-supplied path into an absolute one. */
export function absPath(p: string, cwd = logicalCwd()): string {
    const expanded = untildify(p);
    return isAbsolute(expanded) ? resolve(expanded) : resolve(cwd, expanded);
}
