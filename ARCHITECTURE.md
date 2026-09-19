# Code organization

`b` is a Deno CLI with a zsh wrapper. Its entry point remains `src/cli.ts`.
Commands, aliases, bookmark storage, and the shell protocol retain their existing behavior.

| Location | Responsibility |
| --- | --- |
| `src/cli.ts` | Process exit codes and user-facing error handling |
| `src/app.ts` | Argument dispatch and wiring concrete dependencies into handlers |
| `src/commands/` | Bookmark, import, navigation, help, and installation command handlers |
| `src/bookmarks/model.ts` | Bookmark types, name validation, sorting, and query resolution without I/O |
| `src/bookmarks/repository.ts` | Storage contract and JSON file persistence |
| `src/bookmarks/resolve.ts` | Shared user-facing resolution failures |
| `src/context.ts` | Shell environment, remembered directories, and recent context persistence |
| `src/shell/` | Shell assets and directive output |
| `src/setup/` | Installation orchestration, binary installation, zshrc editing, Starship integration, and diagnostics |
| `src/complete.ts` | Machine-readable completion candidates |
| `src/paths.ts`, `src/output.ts`, `src/errors.ts` | Path conventions, terminal presentation, and expected failures |

Command factories receive a small bookmark repository contract and only the context
operations they use. Navigation also accepts a shell-action callback, so its behavior
can be exercised with in-memory storage and recorded actions. `app.ts` supplies the
file-backed implementations. The domain model does not depend on terminal output,
Deno, or persistence.

Add command handlers under `commands/` and register their names and aliases in
`app.ts`. Update help, completion metadata, and reserved bookmark names when adding
a public command. Keep setup work in its dedicated component; setup modules and
shell assets remain lazily loaded by their command adapters.

Run `deno task check`, `deno task test`, `deno task lint`, and
`deno task format:check` to validate changes. Tests cover query rules, navigation
with substituted dependencies, managed zshrc blocks, and CLI workflows using
temporary configuration directories. The CLI test does not install a global shim.
