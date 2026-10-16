#!/bin/bash
file="$(realpath "$1")"

fuser -k 3000/tcp 2>/dev/null

cd "$HOME/github/mdBun" || exit 1

setsid bun run server.ts "$file" >/tmp/mdbun.log 2>&1 &

while ! nc -z localhost 3000 2>/dev/null; do
    sleep 0.1
done

xdg-open "http://localhost:3000/"
