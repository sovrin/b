#!/usr/bin/env -S deno run --allow-read --allow-write --allow-env --allow-run=deno
import { basename } from 'node:path';

import { complete } from './complete.ts';
import {
    activeCtx,
    forgetCtx,
    previousCtx,
    pruneRecent,
    pushRecent,
    rememberedCwd,
    renameCtx,
} from './context.ts';
import {
    bold,
    cyan,
    dim,
    green,
    info,
    ok,
    red,
    UserError,
    warn,
    yellow,
} from './output.ts';
import { marksDir, tildify } from './paths.ts';
import {
    absPath,
    entries,
    load,
    resolveQuery,
    save,
    type Store,
    validateName,
} from './store.ts';

const VERSION = '0.1.0';
const SHELL_HEADER = '\x01b2';

let fromShell = false;

type ShellAction = {
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
function emitShell(action: ShellAction): number {
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

function resolveOrDie(store: Store, query: string): string {
    const res = resolveQuery(store, query);
    if (res.kind === 'ok') return res.path;
    if (res.kind === 'ambiguous') {
        throw new UserError(
            `"${res.query}" matches ${res.matches.length} bookmarks: ${res.matches.join(', ')}`,
        );
    }
    const known = entries(store);
    throw new UserError(
        known.length === 0
            ? `no bookmark "${res.query}" — you have none yet, try \`b add\``
            : `no bookmark "${res.query}" — try \`b ls\``,
    );
}

function takeFlag(args: string[], ...names: string[]): boolean {
    let found = false;
    for (const n of names) {
        const i = args.indexOf(n);
        if (i !== -1) {
            args.splice(i, 1);
            found = true;
        }
    }
    return found;
}

function cmdAdd(args: string[]): number {
    const force = takeFlag(args, '--force', '-f');
    const store = load();
    const path = absPath(args[1] ?? '.');
    const name = args[0] ?? basename(path);

    const bad = validateName(name);
    if (bad) throw new UserError(bad);
    if (!Deno.statSync(path).isDirectory)
        throw new UserError(`not a directory: ${path}`);

    const prev = store.bookmarks[name];
    if (prev && prev.path !== path && !force) {
        throw new UserError(
            `"${name}" already points at ${tildify(prev.path)} — pass --force to overwrite`,
        );
    }

    store.bookmarks[name] = {
        path,
        created: prev?.created ?? new Date().toISOString(),
        hits: prev?.hits ?? 0,
    };
    save(store);
    ok(`${bold(name)} → ${cyan(tildify(path))}`);
    return 0;
}

function cmdRm(args: string[]): number {
    if (args.length === 0) throw new UserError('usage: b rm <name>...');
    const store = load();
    for (const q of args) {
        const res = resolveQuery(store, q.replace(/\/+$/, ''));
        if (res.kind !== 'ok' || res.sub !== '') {
            throw new UserError(`no bookmark "${q}"`);
        }
        delete store.bookmarks[res.name];
        forgetCtx(res.name);
        ok(`removed ${bold(res.name)}`);
    }
    save(store);
    return 0;
}

function cmdMv(args: string[]): number {
    const [from, to] = args;
    if (!from || !to) throw new UserError('usage: b mv <old> <new>');
    const store = load();
    const res = resolveQuery(store, from.replace(/\/+$/, ''));
    if (res.kind !== 'ok' || res.sub !== '')
        throw new UserError(`no bookmark "${from}"`);
    const bad = validateName(to);
    if (bad) throw new UserError(bad);
    if (Object.hasOwn(store.bookmarks, to))
        throw new UserError(`"${to}" already exists`);
    store.bookmarks[to] = store.bookmarks[res.name]!;
    delete store.bookmarks[res.name];
    renameCtx(res.name, to);
    save(store);
    ok(`${bold(res.name)} → ${bold(to)}`);
    return 0;
}

/**
 * Import the older cd_mark store: one symlink per bookmark under ~/.marks.
 */
function cmdImport(args: string[]): number {
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

    const store = load();
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
    save(store);
    info('');
    info(
        `Imported ${added} from ${cyan(tildify(dir))}${skipped ? `, skipped ${skipped}` : ''}.`,
    );
    return 0;
}

function cmdLs(args: string[]): number {
    const bare = takeFlag(args, '--paths', '-p');
    const store = load();
    const rows = entries(store);
    if (rows.length === 0) {
        info(`No bookmarks yet. ${dim('cd somewhere, then `b add`.')}`);
        return 0;
    }
    if (bare) {
        for (const [, bm] of rows) console.log(bm.path);
        return 0;
    }
    const width = Math.max(
        ...rows.map(([n]) => {
            return n.length;
        }),
    );
    const current = activeCtx();
    for (const [name, bm] of rows) {
        let missing = false;
        try {
            missing = !Deno.statSync(bm.path).isDirectory;
        } catch {
            missing = true;
        }
        const marker = name === current ? green('▶') : ' ';
        const label = bold(name.padEnd(width));
        const path = missing
            ? `${red(tildify(bm.path))} ${yellow('(missing)')}`
            : cyan(tildify(bm.path));
        // Only worth showing when the context is parked below its own root.
        const parked = rememberedCwd(name, bm.path);
        const at =
            parked !== null && parked !== bm.path
                ? ` ${dim(`⌂ ${parked.slice(bm.path.length + 1)}`)}`
                : '';
        console.log(`${marker} ${label}  ${path}${at}`);
    }
    return 0;
}

/**
 * Activate a context: move to where it was last left, or to the bookmark root
 * on a first visit or when the query names a subdirectory.
 */
function cmdEnter(store: Store, query: string): number {
    const res = resolveQuery(store, query);
    if (res.kind === 'ambiguous') {
        throw new UserError(
            `"${res.query}" matches ${res.matches.length} bookmarks: ${res.matches.join(', ')}`,
        );
    }
    if (res.kind === 'missing') {
        throw new UserError(
            Object.keys(store.bookmarks).length === 0
                ? `no bookmark "${res.query}" — you have none yet, try \`b add\``
                : `no bookmark "${res.query}" — try \`b ls\``,
        );
    }

    const root = store.bookmarks[res.name]!.path;
    let target: string;
    if (res.sub !== '') {
        target = res.path;
    } else if (activeCtx() === res.name) {
        // Already here: treat a repeat as "go home".
        target = root;
    } else {
        target = rememberedCwd(res.name, root) ?? root;
    }

    const bm = store.bookmarks[res.name]!;
    bm.hits += 1;
    try {
        save(store);
    } catch {
        /* a read-only config must not block the jump */
    }
    pushRecent(res.name);

    return emitShell({ cd: target, ctx: res.name, root });
}

/** `b =` — back to the context before this one. */
function cmdSwitchBack(store: Store): number {
    const current = activeCtx();
    let name = previousCtx();
    if (name === null || !Object.hasOwn(store.bookmarks, name)) {
        // Fresh shell: fall back to the most recent context used anywhere.
        name =
            pruneRecent(store).find((n) => {
                return n !== current;
            }) ?? null;
    }
    if (name === null)
        throw new UserError('no previous context to switch back to');
    if (name === current)
        throw new UserError(`already in context ${bold(name)}`);
    return cmdEnter(store, name);
}

/** `b off` — leave the current context without moving. */
function cmdOff(): number {
    const current = activeCtx();
    if (current === null) {
        info('no active context');
        return 0;
    }
    const code = emitShell({ ctx: null });
    if (code === 0) ok(`left context ${bold(current)}`);
    return code;
}

function usage(): void {
    const l = (cmd: string, text: string) => {
        return info(`  ${cyan(cmd.padEnd(22))} ${text}`);
    };
    info(
        `${bold('b')} — jump to bookmarked directories  ${dim(`v${VERSION}`)}`,
    );
    info('');
    info(bold('Contexts'));
    l('b <name>', 'enter its context (resumes where you left off)');
    l('b <name>/<subdir>', 'enter the context at a subdirectory');
    l('b =', 'switch back to the previous context');
    l('b off', 'leave the current context');
    l('b -', 'cd to the previous directory (plain zsh)');
    info('');
    info(bold('Managing'));
    l(
        'b add [name] [path]',
        "bookmark a directory (defaults: $PWD's name, $PWD)",
    );
    l('b rm <name>...', 'delete bookmarks');
    l('b mv <old> <new>', 'rename a bookmark');
    l('b ls [--paths]', 'list bookmarks');
    l('b import [dir]', 'import symlink bookmarks from ~/.marks');
    l('b path <name>', 'print a path without moving');
    info('');
    info(bold('Setup'));
    l('b setup', 'install the zsh wrapper + completion, patch ~/.zshrc');
    l('b setup --dry-run', 'show what setup would change');
    l('b setup --starship', 'add the context segment to starship.toml');
    l('b setup --remove', 'undo the ~/.zshrc integration');
    l('b starship', 'print the starship segment');
    l('b doctor', 'check the installation');
    l('b completions zsh', 'print the completion/wrapper script');
    info('');
    info(`${dim('Tab-complete everything:')} ${cyan('b <TAB>')}`);
}

async function main(): Promise<number> {
    const args = [...Deno.args];
    if (takeFlag(args, '--from-shell')) {
        fromShell = true;
        Deno.env.set('B_FROM_SHELL', '1');
    }

    // Completion is a hot path: no output helpers, no validation, never fails loudly.
    if (args[0] === '__complete') {
        const current = Number.parseInt(args[1] ?? '1', 10);
        const words = args.slice(2);
        try {
            console.log(
                complete(Number.isNaN(current) ? 1 : current, words).join('\n'),
            );
        } catch {
            console.log('@mode:none');
        }
        return 0;
    }

    if (takeFlag(args, '--version', '-V')) {
        console.log(VERSION);
        return 0;
    }
    const wantsHelp = takeFlag(args, '--help', '-h');
    const cmd = args[0];
    if (wantsHelp || cmd === 'help') {
        usage();
        return 0;
    }
    if (cmd === undefined) return cmdLs([]);

    const rest = args.slice(1);
    switch (cmd) {
        case 'add':
        case 'a':
            return cmdAdd(rest);
        case 'rm':
        case 'remove':
        case 'del':
            return cmdRm(rest);
        case 'mv':
        case 'rename':
            return cmdMv(rest);
        case 'import':
            return cmdImport(rest);
        case 'ls':
        case 'list':
            return cmdLs(rest);
        case 'path':
        case 'get': {
            if (!rest[0]) throw new UserError('usage: b path <name>');
            console.log(resolveOrDie(load(), rest[0]));
            return 0;
        }
        case 'setup': {
            const { setup } = await import('./setup.ts');
            return await setup({
                dryRun: takeFlag(rest, '--dry-run', '-n'),
                remove: takeFlag(rest, '--remove', '--uninstall'),
                force: takeFlag(rest, '--force', '-f'),
                starship: takeFlag(rest, '--starship'),
            });
        }
        case 'doctor': {
            const { doctor } = await import('./setup.ts');
            return doctor();
        }
        case 'starship': {
            const { starshipSnippet } = await import('./setup.ts');
            console.log(starshipSnippet().trimEnd());
            return 0;
        }
        case 'completions':
        case 'shell-init': {
            const shell = rest[0] ?? 'zsh';
            if (shell !== 'zsh')
                throw new UserError(
                    `only zsh is supported so far (got "${shell}")`,
                );
            const { shellInit } = await import('./setup.ts');
            console.log(shellInit());
            return 0;
        }
    }

    if (cmd === '=') return cmdSwitchBack(load());
    if (cmd === 'off') return cmdOff();

    if (cmd.startsWith('-')) {
        throw new UserError(`unknown option "${cmd}" — see \`b help\``);
    }

    return cmdEnter(load(), cmd);
}

try {
    Deno.exit(await main());
} catch (err) {
    if (err instanceof UserError) {
        console.error(`${red('✗')} ${err.message}`);
        Deno.exit(1);
    }
    if (err instanceof Deno.errors.NotFound) {
        console.error(`${red('✗')} ${err.message}`);
        Deno.exit(1);
    }
    throw err;
}
