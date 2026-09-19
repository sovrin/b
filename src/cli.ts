#!/usr/bin/env -S deno run --allow-read --allow-write --allow-env --allow-run=deno
import { run } from './app.ts';
import { UserError } from './errors.ts';
import { red } from './output.ts';

if (import.meta.main) {
    try {
        Deno.exit(await run(Deno.args));
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
}
