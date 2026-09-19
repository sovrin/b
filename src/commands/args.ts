export function takeFlag(args: string[], ...names: string[]): boolean {
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
