/**
 * The shell wrapper captures stdout, so `Deno.stdout.isTerminal()` is false even
 * in an interactive session. The wrapper therefore forwards the real tty state
 * as B_TTY.
 */
function colorEnabled(): boolean {
    if (Deno.env.get('NO_COLOR')) return false;
    const forwarded = Deno.env.get('B_TTY');
    if (forwarded !== undefined) return forwarded === '1';
    return Deno.stdout.isTerminal();
}

const on = colorEnabled();
function wrap(code: string): (s: string) => string {
    return function paint(s: string): string {
        return on ? `\x1b[${code}m${s}\x1b[0m` : s;
    };
}

export const bold = wrap('1');
export const dim = wrap('2');
export const red = wrap('31');
export const green = wrap('32');
export const yellow = wrap('33');
export const cyan = wrap('36');

export function info(msg: string): void {
    console.error(msg);
}

export function ok(msg: string): void {
    console.error(`${green('✓')} ${msg}`);
}

export function warn(msg: string): void {
    console.error(`${yellow('!')} ${msg}`);
}

export function fail(msg: string): void {
    console.error(`${red('✗')} ${msg}`);
}

/** Thrown for expected, user-facing failures; cli.ts prints it without a stack. */
export class UserError extends Error {}
