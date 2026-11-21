# herdr-mods

My [Herdr](https://herdr.dev) setup: app settings, key bindings, a layout and a few mods.

## Install

Install Herdr first. Its installer creates `~/.config/herdr-app` and the mods that ship with it. Then:

```bash
make install
```

This symlinks the files below into `~/.config/herdr-app`, so edits here apply right away. It leaves Herdr's shipped mods alone. `make uninstall` removes only the links that point into this checkout. Run `make help` to list the targets.

## What's here

| Path | What it does |
| --- | --- |
| `settings.json` | App settings |
| `keys.json` | Key bindings, including the keys that open the mods |
| `programs.json` | Default model and effort for the agent CLIs |
| `layouts/my-main.json` | Main layout. It places `pr-toggle`, `gtr`, `zed` and `recherche` in the tab bar, so install the mods before using it. |

## Mods

| Mod | What it does |
| --- | --- |
| `pr-flow` | Side panel listing the PRs your agents opened and their status. Read-only. Vendored from [jjangsky/herdr-pr-flow](https://github.com/jjangsky/herdr-pr-flow). |
| `pr-toggle` | Tab-bar button that shows and hides the `pr-flow` panel |
| `gtr` | Asks for a branch, runs `git gtr new` from the focused pane's folder and opens a space on the new worktree |
| `zed` | Opens the focused terminal's folder in Zed |
| `recherche` | Searches past agent sessions through `recherche serve`, previews them and resumes them |

After changing a mod, check it with:

```bash
herdr-app check mods/<name>
```
