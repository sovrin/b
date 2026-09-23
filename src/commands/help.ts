import { bold, cyan, dim, info } from '../output.ts';

export const VERSION = '0.1.0';

export function usage(): void {
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
    l('b version', 'print the version');
    info('');
    info(`${dim('Tab-complete everything:')} ${cyan('b <TAB>')}`);
}
