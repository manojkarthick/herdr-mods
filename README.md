# herdr-mods

My [Herdr](https://herdr.dev) setup: app settings, key bindings, a layout and a few mods.

## Install

Install Herdr first. Its installer creates `~/.config/herdr-app` and the mods that ship with it. Then:

```bash
make install
```

This installs the [third-party mods](#third-party-mods) at their pinned versions, then symlinks the files below into `~/.config/herdr-app`, so edits here apply right away. It leaves Herdr's shipped mods alone. `make uninstall` removes the links that point into this checkout and the third-party mods that install copied. Run `make help` to list the targets.

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
| `pr-toggle` | Tab-bar button that shows and hides the `pr-flow` panel |
| `gtr` | Asks for a branch, runs `git gtr new` from the focused pane's folder and opens a space on the new worktree |
| `zed` | Opens the focused terminal's folder in Zed |
| `recherche` | Searches past agent sessions through `recherche serve`, previews them and resumes them |

## Third-party mods

Mods by other people aren't kept in this repo. `vendor.json` pins each one to a commit, and `make install` fetches that commit and installs it:

| Mod | Source | Tracks | Installed by |
| --- | --- | --- | --- |
| `pr-flow` | [jjangsky/herdr-pr-flow](https://github.com/jjangsky/herdr-pr-flow) | latest release | copying its `mods/pr-flow` |
| `herdr-t3` | [JinJieBeWater/herdr-t3](https://github.com/JinJieBeWater/herdr-t3) | `main` | its own `scripts/update.sh` (the `t3-*` mods, the `herdr-t3` layout and its keys) |
| `cursor-status` | [juliorr/herdr-cursor-status](https://github.com/juliorr/herdr-cursor-status) | `main` | copying its `mods/cursor-status`, then running its `status.mjs install` |

`make update` moves the pins to the newest release or commit; run `make install` afterwards to apply them. A weekly GitHub Action runs `make update` and opens a PR with the release notes or new changelog lines.

herdr-t3's installer merges its bindings into `keys.json`, but `make install` links this repo's `keys.json` back over it. Copy the bindings you want into `keys.json`; install prints how many differ.

cursor-status reports Cursor Agent CLI (`cursor-agent`) status to the desktop app's Agents panel, which Cursor doesn't do itself. `make install` needs Node 20 or later for it. Its installer adds hooks to `~/.cursor/hooks.json`, after any hooks already there, and backs up the original on the first change; `make uninstall` removes those hooks before it removes the mod. Restart running Cursor sessions to load the hooks, and check them with `node ~/.config/herdr-app/mods/cursor-status/status.mjs doctor`. Cursor has no hook for permission prompts, so a session waiting for approval shows as working.

## Checking mods

After changing a mod, check it with:

```bash
herdr-app check mods/<name>
```

## License

MIT, see [LICENSE](LICENSE). The third-party mods that `make install` fetches keep their own licenses.
