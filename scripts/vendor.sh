#!/bin/sh
# Third-party mods pinned in vendor.json.
#   update     moves each pin to the newest release, or the newest commit on the tracked branch.
#              It changes only vendor.json. With UPDATE_SUMMARY set, it appends a Markdown summary there.
#   install    fetches each pinned commit and puts it into Herdr: "copy" copies one folder into mods/,
#              "install" runs the mod's own installer.
#   uninstall  removes the folders that install copied. Installer-run mods are left alone.
set -eu
root=$(cd "$(dirname "$0")/.." && pwd)
pins="$root/vendor.json"
app=${HERDR_DIR:-$HOME/.config/herdr-app}
cache=${XDG_CACHE_HOME:-$HOME/.cache}/herdr-mods

get() { jq -r --arg n "$1" --arg f "$2" '.[$n][$f] // empty' "$pins"; }
say() { printf '  %-10s %s\n' "$1" "$2"; }

update() {
  for n in $(jq -r 'keys_unsorted[]' "$pins"); do
    repo=$(get "$n" repo) track=$(get "$n" track) old=$(get "$n" commit) old_ref=$(get "$n" ref)
    url="https://github.com/$repo"
    if [ "$track" = release ]; then
      ref=$(gh api "repos/$repo/releases/latest" --jq .tag_name)
      # An annotated tag also lists its commit as <tag>^{}, which sorts last.
      commit=$(git ls-remote "$url" "refs/tags/$ref" "refs/tags/$ref^{}" | sort -k2 | tail -1 | cut -f1)
    else
      ref=
      commit=$(git ls-remote "$url" "refs/heads/$track" | cut -f1)
    fi
    [ -n "$commit" ] || { echo "cannot find $track of $repo" >&2; exit 1; }
    if [ "$commit" = "$old" ]; then say unchanged "$n ${ref:-$track@$(echo "$commit" | cut -c1-7)}"; continue; fi

    tmp=$(mktemp)
    jq --arg n "$n" --arg c "$commit" --arg r "$ref" \
      '.[$n].commit = $c | if $r != "" then .[$n].ref = $r else . end' "$pins" > "$tmp"
    mv "$tmp" "$pins"
    from=${old_ref:-$(echo "$old" | cut -c1-7)} to=${ref:-$(echo "$commit" | cut -c1-7)}
    say updated "$n $from -> $to"

    [ -n "${UPDATE_SUMMARY:-}" ] || continue
    {
      printf '### %s: %s → %s\n\n[Compare](%s/compare/%s...%s)' "$n" "$from" "$to" "$url" "$old" "$commit"
      if [ -n "$ref" ]; then
        # Fenced, so the notes' own headings don't outrank this section's. Tildes, since notes may hold ``` blocks.
        printf ' · [Release](%s/releases/tag/%s)\n\n~~~markdown\n' "$url" "$ref"
        gh api "repos/$repo/releases/tags/$ref" --jq '.body // ""'
        printf '\n~~~'
      else
        # Without releases, the lines added to the changelog are the closest thing to notes.
        printf '\n\n'
        gh api "repos/$repo/compare/$old...$commit" --jq '.files[] | select(.filename == "CHANGELOG.md") | .patch' |
          grep '^+' | grep -v '^+++' | cut -c2- || true
      fi
      printf '\n\n'
    } >> "$UPDATE_SUMMARY"
  done
}

# Shallow clone of the pinned commit, kept in the cache until the pin moves.
fetch() {
  dir="$cache/$1" commit=$(get "$1" commit)
  if [ "$(git -C "$dir" rev-parse HEAD 2>/dev/null)" != "$commit" ]; then
    rm -rf "$dir"
    git init -q "$dir"
    git -C "$dir" fetch -q --depth 1 "https://github.com/$(get "$1" repo)" "$commit"
    git -C "$dir" -c advice.detachedHead=false checkout -q FETCH_HEAD
  fi
}

install() {
  for n in $(jq -r 'keys_unsorted[]' "$pins"); do
    fetch "$n"
    src="$cache/$n" copy=$(get "$n" copy) script=$(get "$n" install)
    version=$(get "$n" ref)
    version=${version:-$(get "$n" track)@$(get "$n" commit | cut -c1-7)}
    if [ -n "$copy" ]; then
      dst="$app/mods/$(basename "$copy")"
      # An older install may have linked this folder from the checkout.
      if [ -L "$dst" ]; then rm "$dst"; fi
      mkdir -p "$dst"
      # Herdr writes these two into every mod folder.
      rsync -a --delete --exclude gpui-kit.d.ts --exclude jsconfig.json "$src/$copy/" "$dst/"
      say copied "$n $version"
    fi
    if [ -n "$script" ]; then
      say running "$n $version: $script"
      HERDR_APP_HOME="$app" "$src/$script"
      # The installer merges its keys into keys.json, which make install links back to ours afterwards.
      if [ -f "$src/keys.json" ]; then
        jq -r --slurpfile mine "$root/keys.json" --arg n "$n" --arg f "$src/keys.json" '
          [to_entries[] | .key as $s | .value | to_entries[] | select($mine[0][$s][.key] != .value) | $s]
          | select(length > 0)
          | "  \($n): \(length) bindings in \(unique | join(", ")) differ from keys.json. Theirs: \($f)"
        ' "$src/keys.json"
      fi
    fi
  done
}

uninstall() {
  for n in $(jq -r 'keys_unsorted[]' "$pins"); do
    copy=$(get "$n" copy)
    [ -n "$copy" ] || continue
    dst="$app/mods/$(basename "$copy")"
    if [ -d "$dst" ] && [ ! -L "$dst" ]; then rm -r "$dst" && say removed "mods/$(basename "$copy")"; fi
  done
}

for tool in jq git; do command -v "$tool" >/dev/null || { echo "$0 needs $tool" >&2; exit 1; }; done
case "${1:-}" in
  update) command -v gh >/dev/null || { echo "$0 update needs gh" >&2; exit 1; }; update ;;
  install) command -v rsync >/dev/null || { echo "$0 install needs rsync" >&2; exit 1; }; install ;;
  uninstall) uninstall ;;
  *) echo "usage: $0 update|install|uninstall" >&2; exit 2 ;;
esac
