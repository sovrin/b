import {
    deepStrictEqual,
    doesNotMatch,
    match,
    strictEqual,
} from 'node:assert/strict';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const entry = fileURLToPath(new URL('./cli.ts', import.meta.url));

type Result = { code: number; out: string; err: string };

/** Run the CLI against a sandbox: config, rc files, and marks all live inside it. */
async function cli(
    sandbox: string,
    cwd: string,
    args: string[],
    extraEnv: Record<string, string> = {},
): Promise<Result> {
    const result = await new Deno.Command('deno', {
        args: [
            'run',
            '--quiet',
            '--allow-read',
            '--allow-write',
            '--allow-env',
            '--allow-run=deno',
            entry,
            ...args,
        ],
        cwd,
        env: {
            XDG_CONFIG_HOME: join(sandbox, 'config'),
            ZDOTDIR: sandbox,
            STARSHIP_CONFIG: join(sandbox, 'starship.toml'),
            DENO_INSTALL_ROOT: join(sandbox, 'deno'),
            MARKPATH: join(sandbox, 'marks'),
            PWD: cwd,
            B_CTX: '',
            B_CTX_PREV: '',
            B_FROM_SHELL: '',
            B_TTY: '0',
            NO_COLOR: '1',
            ...extraEnv,
        },
        stdout: 'piped',
        stderr: 'piped',
    }).output();
    return {
        code: result.code,
        out: new TextDecoder().decode(result.stdout),
        err: new TextDecoder().decode(result.stderr),
    };
}

function makeSandbox(): string {
    return Deno.realPathSync(Deno.makeTempDirSync({ prefix: 'b-test-' }));
}

Deno.test('CLI preserves bookmark, context, completion, and setup workflows', async () => {
    const sandbox = makeSandbox();
    const project = join(sandbox, 'project');
    const config = join(sandbox, 'config');
    const rc = join(sandbox, '.zshrc');
    const starship = join(sandbox, 'starship.toml');
    const marks = join(sandbox, 'marks');
    Deno.mkdirSync(join(project, 'src'), { recursive: true });
    Deno.mkdirSync(marks);
    Deno.symlinkSync(project, join(marks, 'legacy'));
    Deno.writeTextFileSync(rc, 'export EDITOR=vim\n');
    Deno.writeTextFileSync(starship, '# prompt\n');

    const run = (args: string[], extraEnv: Record<string, string> = {}) => {
        return cli(sandbox, project, args, extraEnv);
    };

    try {
        strictEqual((await run(['a', 'project'])).code, 0);
        strictEqual((await run(['get', 'proj/src'])).out, `${project}/src\n`);
        strictEqual((await run(['list', '-p'])).out, `${project}\n`);
        const ctxDir = join(config, 'b', 'ctx');
        Deno.mkdirSync(ctxDir);
        Deno.writeTextFileSync(join(ctxDir, 'project'), `${project}/src\n`);
        strictEqual(
            (await run(['--from-shell', 'project'])).out,
            `\x01b2\ncd:${project}/src\nctx:project\nroot:${project}`,
        );
        strictEqual(
            (await run(['--from-shell', 'project'], { B_CTX: 'project' })).out,
            `\x01b2\ncd:${project}\nctx:project\nroot:${project}`,
        );
        strictEqual(
            (await run(['--from-shell', 'off'], { B_CTX: 'project' })).out,
            '\x01b2\nctx:',
        );
        const plain = await run(['project']);
        strictEqual(plain.out, `${project}/src\n`);
        match(plain.err, /shell integration is not active/);
        const completion = await run(['__complete', '2', 'b', 'project/s']);
        strictEqual(completion.out, '@mode:paths\n@strip:8\nsrc/\n');
        strictEqual((await run(['rename', 'project', 'renamed'])).code, 0);
        strictEqual(
            Deno.readTextFileSync(join(ctxDir, 'renamed')),
            `${project}/src\n`,
        );
        strictEqual((await run(['import'])).code, 0);
        strictEqual((await run(['path', 'legacy'])).out, `${project}\n`);
        strictEqual((await run(['del', 'renamed', 'legacy'])).code, 0);
        const store = JSON.parse(
            Deno.readTextFileSync(join(config, 'b', 'bookmarks.json')),
        );
        deepStrictEqual(store.bookmarks, {});
        strictEqual((await run(['missing'])).code, 1);
        const invalid = await run(['--unknown']);
        strictEqual(invalid.code, 1);
        match(invalid.err, /unknown option/);
        const dryRun = await run(['setup', '--dry-run', '--starship']);
        strictEqual(dryRun.code, 0);
        match(
            dryRun.err,
            new RegExp(entry.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
        );
        strictEqual(Deno.readTextFileSync(rc), 'export EDITOR=vim\n');
        strictEqual(Deno.readTextFileSync(starship), '# prompt\n');
        match((await run(['completions', 'zsh'])).out, /compdef _b b/);
        match((await run(['starship'])).out, /\[env_var.B_CTX\]/);
        const begin = '# >>> b (path bookmarks) >>>';
        const end = '# <<< b (path bookmarks) <<<';
        Deno.writeTextFileSync(
            rc,
            `export EDITOR=vim\n${begin}\nsource init.zsh\n${end}\n`,
        );
        strictEqual((await run(['setup', '--remove'])).code, 0);
        strictEqual(Deno.readTextFileSync(rc), 'export EDITOR=vim\n');
    } finally {
        Deno.removeSync(sandbox, { recursive: true });
    }
});

Deno.test('CLI keeps logical paths, context state, and imports consistent', async () => {
    const sandbox = makeSandbox();
    const config = join(sandbox, 'config');
    const real = join(sandbox, 'real', 'proj');
    const link = join(sandbox, 'code');
    const marks = join(sandbox, 'marks');
    Deno.mkdirSync(join(real, 'src'), { recursive: true });
    Deno.symlinkSync(join(sandbox, 'real'), link);
    Deno.mkdirSync(marks);
    Deno.symlinkSync(join(sandbox, 'gone'), join(marks, 'ghost'));
    Deno.writeTextFileSync(join(sandbox, 'file'), '');
    Deno.symlinkSync(join(sandbox, 'file'), join(marks, 'file'));
    Deno.symlinkSync(real, join(marks, 'legacy'));
    const logical = join(link, 'proj');
    const run = (args: string[], extraEnv: Record<string, string> = {}) => {
        return cli(sandbox, logical, args, extraEnv);
    };

    try {
        // Bookmarks keep the path the shell reports, not the symlink target.
        strictEqual((await run(['add'])).code, 0);
        strictEqual((await run(['path', 'proj'])).out, `${logical}\n`);
        const completion = await run(['__complete', '3', 'b', 'a', '']);
        strictEqual(completion.out, '@mode:describe\n');
        match((await run(['__complete', '3', 'b', 'a', '-'])).out, /--force/);
        match(
            (await run(['__complete', '3', 'b', 'list', '-'])).out,
            /--paths/,
        );

        const imported = await run(['import']);
        strictEqual(imported.code, 0);
        match(imported.err, /skipped file — .* is not a directory/);
        match(imported.err, /skipped ghost — .* is missing/);
        match(imported.err, /Imported 1 from .*, skipped 2\./);
        const rm = await run(['__complete', '4', 'b', 'rm', 'proj', '']);
        strictEqual(
            rm.out,
            `@mode:describe\n@group:bookmarks:bookmark\nlegacy\t${real}\n`,
        );

        // Renaming the active context tells the wrapper, and carries its history.
        strictEqual((await run(['--from-shell', 'proj'])).code, 0);
        const mv = await run(['--from-shell', 'mv', 'proj', 'renamed'], {
            B_CTX: 'proj',
            B_CTX_PREV: 'legacy',
        });
        strictEqual(
            mv.out,
            `\x01b2\nctx:renamed\nroot:${logical}\nprev:legacy`,
        );
        strictEqual(
            Deno.readTextFileSync(join(config, 'b', 'recent')),
            'renamed\n',
        );
        const rmActive = await run(['--from-shell', 'rm', 'renamed'], {
            B_CTX: 'renamed',
        });
        strictEqual(rmActive.out, '\x01b2\nctx:\nprev:');
        strictEqual(Deno.readTextFileSync(join(config, 'b', 'recent')), '\n');

        strictEqual((await run(['version'])).out, '0.1.0\n');

        Deno.writeTextFileSync(join(config, 'b', 'bookmarks.json'), '{');
        const corrupt = await run(['ls']);
        strictEqual(corrupt.code, 1);
        match(corrupt.err, /^✗ .*bookmarks\.json is not valid JSON/);
    } finally {
        Deno.removeSync(sandbox, { recursive: true });
    }
});

Deno.test('setup only mentions a pinned starship format when it is top-level', async () => {
    const sandbox = makeSandbox();
    const starship = join(sandbox, 'starship.toml');
    const hint = /pins a top-level `format`/;
    const run = () => {
        return cli(sandbox, sandbox, ['setup', '--dry-run', '--starship']);
    };
    try {
        Deno.writeTextFileSync(starship, '[git_branch]\nformat = "x"\n');
        doesNotMatch((await run()).err, hint);
        Deno.writeTextFileSync(starship, 'format = "$all"\n[git_branch]\n');
        match((await run()).err, hint);
    } finally {
        Deno.removeSync(sandbox, { recursive: true });
    }
});
