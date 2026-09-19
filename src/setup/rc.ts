import { initFile, tildify, zshrc } from '../paths.ts';

const BEGIN = '# >>> b (path bookmarks) >>>';
const END = '# <<< b (path bookmarks) <<<';

/** ~/x → $HOME/x so the generated snippet survives a moved home dir. */
function homeRef(p: string): string {
    const t = tildify(p);
    return t.startsWith('~') ? `$HOME${t.slice(1)}` : p;
}

function homeVar(p: string): string {
    return `"${homeRef(p)}"`;
}

export function rcBlock(needPath: boolean, binDir: string): string {
    const lines = [BEGIN];
    if (needPath) lines.push(`export PATH="${homeRef(binDir)}:$PATH"`);
    lines.push(
        `[[ -f ${homeVar(initFile())} ]] && source ${homeVar(initFile())}`,
    );
    lines.push(END);
    return lines.join('\n');
}

type RcState = { text: string; hasBlock: boolean };

export function readRc(): RcState {
    try {
        const text = Deno.readTextFileSync(zshrc());
        return { text, hasBlock: text.includes(BEGIN) };
    } catch (err) {
        if (err instanceof Deno.errors.NotFound)
            return { text: '', hasBlock: false };
        throw err;
    }
}

/** The existing managed block, or "" when there is none. */
export function currentBlock(text: string): string {
    const start = text.indexOf(BEGIN);
    if (start === -1) return '';
    const endIdx = text.indexOf(END, start);
    return text.slice(start, endIdx === -1 ? text.length : endIdx + END.length);
}

export function replaceBlock(text: string, block: string | null): string {
    const start = text.indexOf(BEGIN);
    if (start === -1) {
        if (block === null) return text;
        const sep = text.length === 0 || text.endsWith('\n') ? '' : '\n';
        return `${text}${sep}\n${block}\n`;
    }
    const endIdx = text.indexOf(END, start);
    const stop = endIdx === -1 ? text.length : endIdx + END.length;
    let head = text.slice(0, start);
    const tail = text.slice(stop).replace(/^\n/, '');
    if (block === null) {
        head = head.replace(/\n+$/, '\n');
        return head + tail;
    }
    return `${head}${block}\n${tail}`;
}
