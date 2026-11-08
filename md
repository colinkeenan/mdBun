#!/bin/bash
# Show a Markdown file in the browser. One server shows any number of files, each in its own
# tab: if it's already running, the file is added to it; otherwise it's started.
file="$(realpath "$1")"

# Ask the server to add the file; it prints the file's URL.
open_file() {
    curl -sf --data-urlencode "path=$file" http://localhost:3000/__open
}

if ! url=$(open_file); then
    # Nothing is running, or an old server without /__open is: replace it.
    fuser -k 3000/tcp 2>/dev/null

    cd "$HOME/github/mdBun" || exit 1

    setsid bun run server.ts "$file" >"$HOME/mdbun.log" 2>&1 &

    # Wait up to 10 seconds for it to start.
    for _ in {1..100}; do
        url=$(open_file) && break
        sleep 0.1
    done
    cat "$HOME/mdbun.log"
    [ -n "$url" ] || exit 1
fi

xdg-open "$url"
