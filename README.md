# b

Bookmark directories and jump between them in zsh. Each bookmark remembers where
you left off inside it.

## Install

Requires Deno and zsh on macOS or Linux. From a local clone:

```sh
deno task setup
exec zsh
```

Setup installs `b` and adds shell integration to `.zshrc`. Keep the clone on disk;
the installed command runs its source.

## Usage

```sh
b add project       # Bookmark the current directory
b project           # Jump back to it, resuming where you left off
b project/src       # Jump to a subdirectory
b =                 # Switch to the previous context
b ls                # List bookmarks
b rm project        # Remove a bookmark
b help              # Show all commands
```

Tab completion is included. Run `b doctor` to check your installation.

For development, run `deno task check` and `deno task test`.
See [ARCHITECTURE.md](ARCHITECTURE.md) for the code layout.
