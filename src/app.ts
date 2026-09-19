import * as repository from './bookmarks/repository.ts';
import { takeFlag } from './commands/args.ts';
import { createBookmarkCommands } from './commands/bookmarks.ts';
import { usage, VERSION } from './commands/help.ts';
import { importBookmarks } from './commands/import.ts';
import {
    completionsCommand,
    doctorCommand,
    setupCommand,
    starshipCommand,
} from './commands/installation.ts';
import { createNavigationCommands } from './commands/navigation.ts';
import { complete } from './complete.ts';
import * as contexts from './context.ts';
import { UserError } from './errors.ts';
import { emitShell } from './shell/protocol.ts';

type Command = (args: string[]) => number | Promise<number>;

export async function run(args: string[]): Promise<number> {
    args = [...args];
    const fromShell = takeFlag(args, '--from-shell');
    if (fromShell) {
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
    const bookmarks = createBookmarkCommands(repository, contexts);
    const navigation = createNavigationCommands(
        repository,
        contexts,
        (action) => {
            return emitShell(action, fromShell);
        },
    );
    const commands: Record<string, Command> = {
        add: bookmarks.add,
        a: bookmarks.add,
        rm: bookmarks.remove,
        remove: bookmarks.remove,
        del: bookmarks.remove,
        mv: bookmarks.rename,
        rename: bookmarks.rename,
        import: (rest) => {
            return importBookmarks(rest, repository);
        },
        ls: bookmarks.list,
        list: bookmarks.list,
        path: bookmarks.path,
        get: bookmarks.path,
        setup: setupCommand,
        doctor: doctorCommand,
        starship: starshipCommand,
        completions: completionsCommand,
        'shell-init': completionsCommand,
        '=': navigation.switchBack,
        off: navigation.off,
    };
    if (cmd === undefined) return bookmarks.list([]);
    if (Object.hasOwn(commands, cmd))
        return await commands[cmd]!(args.slice(1));

    if (cmd.startsWith('-')) {
        throw new UserError(`unknown option "${cmd}" — see \`b help\``);
    }

    return navigation.enter(cmd);
}
