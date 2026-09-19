import { deepStrictEqual, match, strictEqual } from 'node:assert/strict';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const entry = fileURLToPath(new URL('./cli.ts', import.meta.url));

Deno.test('CLI preserves bookmark, context, completion, and setup workflows', async () => {
    const sandbox = Deno.realPathSync(
        Deno.makeTempDirSync({ prefix: 'b-test-' }),
    );
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

    async function run(args: string[], extraEnv: Record<string, string> = {}) {
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
            cwd: project,
            env: {
                XDG_CONFIG_HOME: config,
                ZDOTDIR: sandbox,
                STARSHIP_CONFIG: starship,
                DENO_INSTALL_ROOT: join(sandbox, 'deno'),
                MARKPATH: marks,
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
