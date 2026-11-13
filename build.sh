#!/bin/bash
# Makes the `md` command for this computer, in build/: `bun run build`, or `bash build.sh`.
#
# md.in and mdBun.desktop.in are the templates. This script fills in what differs from one
# computer to the next: the folder mdBun is in, where bun is, how an old server is stopped,
# how the browser is opened, and where `md` will be installed. Run it again if you move the
# folder. The README's Install section has the `install` commands that follow it.
set -euo pipefail
shopt -u patsub_replacement 2>/dev/null || true   # bash 5.2: keep `&` in a path literal

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
out="$here/build"

if [ -n "${TERMUX_VERSION:-}" ]; then
    # Termux on Android: bun runs through grun, and there is no desktop file.
    bindir="$PREFIX/bin"
    stop='pkill -f server.ts'
    bun='grun "$HOME/.bun/bin/bun"'
    open='termux-open-url'
    desktop=
else
    bindir="$HOME/.local/bin"
    stop='fuser -k 3000/tcp 2>/dev/null'
    # The full path, because a file manager may not have bun's folder on its PATH.
    bun_path="$(command -v bun)" || { echo "build.sh: bun is not on the PATH" >&2; exit 1; }
    bun="$(printf %q "$bun_path")"
    open='xdg-open'
    desktop=yes
fi

mkdir -p "$out"

md="$(<"$here/md.in")"
md="${md//@STOP@/$stop}"
md="${md//@DIR@/$(printf %q "$here")}"
md="${md//@BUN@/$bun}"
md="${md//@OPEN@/$open}"
printf '%s\n' "$md" >"$out/md"
echo "made build/md         (to be installed as $bindir/md)"

if [ -n "$desktop" ]; then
    exec_md="$bindir/md"
    case "$exec_md" in *' '*) exec_md="\"$exec_md\"" ;; esac
    entry="$(<"$here/mdBun.desktop.in")"
    printf '%s\n' "${entry//@MD@/$exec_md}" >"$out/mdBun.desktop"
    echo "made build/mdBun.desktop"
fi
