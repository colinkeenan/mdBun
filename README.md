# mdBun

Serve `.md` files to `html` on `localhost:3000`on Linux or Termux on Android

Both `server.ts` and `package.json` were written by Claude free. I asked it to make a markdown to html server that would run using bun in a terminal by using bun's built-in markdown capability. I also asked it to render math and html for expandable content, and to simply open the .md file provided on the command line. What it came up with works perfectly without any dependencies but requires internet access in order to access highlight.js CDN and KaTeX. It offered to bundle KaTex and highlight.js locally to make it work offline, but I'd rather keep it working without dependencies. I wrote the desktop file and bash script with a little help from Copilot on the web.

### Linked Markdown files

Links to other `.md` files are rendered as HTML too, so a table of contents that links to one file per chapter works like a small website. Links into subfolders (`chapters/ch1.md`), back up (`../toc.md`), and to headings (`ch1.md#section-a`) all work. Only files inside the folder of a `.md` file you opened with `md` (and its subfolders) can be reached, so open the top-level file (e.g. the table of contents) rather than a chapter in a subfolder.

### Multiple tabs

Each file gets its own address based on its full path, like `http://localhost:3000/home/me/book/toc.md`, so every tab can show a different file, from the same folder or different ones. Running `md` while the server is already running adds the file to it and opens a new tab, instead of restarting the server, so tabs that are already open keep working. The server keeps running until you stop it (e.g. `fuser -k 3000/tcp`). Restarting it means files in folders other than the one you start it with show "Not available" until you run `md` on them again.

Live reload watches only the folders of files being shown. Each tab reloads only when its own file, or an image it shows, changes, so editing one chapter doesn't disturb a tab showing another.

The server only listens on `127.0.0.1`, so other machines can't reach it.

Whether running on Linux or Termux on Android, the first step is to simply clone this repo.

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
1. Edit `md` to have correct path to `mdBun` and correct launcher. (You may have to install additional apps to get `grun` and `curl` to work). Change the command that kills an old running server. Here is the `md` that works for me:
   ```bash
   #!/bin/bash
   file="$(realpath "$1")"

   open_file() {
       curl -sf --data-urlencode "path=$file" http://localhost:3000/__open
   }

   if ! url=$(open_file); then
       pkill -f server.ts

       cd "$HOME/mdBun" || exit 1

       setsid grun "$HOME/.bun/bin/bun" run server.ts "$file" > "$HOME/mdbun.log" 2>&1 &

       for _ in {1..100}; do
           url=$(open_file) && break
           sleep 0.1
       done
       cat "$HOME/mdbun.log"
       [ -n "$url" ] || exit 1
   fi

   termux-open-url "$url"
   ```
1. Execute the following commands in Termux:
   ```bash
   chmod +x md
   mv md /data/data/com.termux/files/urs/bin/md
   ln -s /data/data/com.termux/files/usr/bin/md ~/bin/termux-file-editor
   ```
1. The Fluffy file browser works well with this. Press a .md file in Fluffy (don't bother to checkmark), choose to open with "Termux" and choose "Edit". It will run `~/bin/termux-file-editor` in Termux which is the `md` command and the chosen `.md` file will be displayed in your default browser.
