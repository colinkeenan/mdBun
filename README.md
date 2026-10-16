# mdBun

Serve `.md` files to html on `localhost:3000`on Linux or Termux on Android  
For either, first clone this repo.

### Linux

1. Edit `mdBun.destop` to have the correct path to an icon (or remove path to icon).
1. Put `mdBun.desktop` in `~/.local/share/applications`.
1. Edit `md` to have the correct path to `mdBun`, `chmod +x md`, and put `md` in `/usr/local/bin`.
1. In a file browser, set the default application for opening `.md` files to `mdBun`.

Run in terminal with `md file.md` for whatever`file.md` you want.  
Run in GUI by clicking the `.md` file from the file browser.

### Termux on Android

1. Give Termux permision to run over other apps and for battery usage to run in background.
1. Ignore mdBun.destop.
1. Edit `md` to have correct path to `mdBun` and correct launcher. (You may have to install additional apps to get `grun` and `nc` to work). Change the command that kills already running server. Here is the `md` that works for me:
   ```bash
   #!/bin/bash
   file="$(realpath "$1")"

   pkill -f server.ts

   cd "$HOME/mdBun" || exit 1

   setsid grun "$HOME/.bun/bin/bun" run server.ts "$file" > "$HOME/mdbun.log" 2>&1 &

   while ! nc -z localhost 3000; do
       sleep 0.1
   done

   cat "$HOME/mdbun.log"
   termux-open-url "http://localhost:3000"
   ```
1. Execute the following commands in Termux:
   ```bash
   chmod +x md
   mv md /data/data/com.termux/files/urs/bin/md
   ln -s /data/data/com.termux/files/usr/bin/md ~/bin/termux-file-editor
   ```
1. The Fluffy file browser works well with this. Press a .md file in Fluffy (don't bother to checkmark), choose to open with "Termux" and choose "Edit". It will run `~/bin/termux-file-editor` in Termux which is the `md` command and the chosen `.md` file will be displayed in your default browser.
