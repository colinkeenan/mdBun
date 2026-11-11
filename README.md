# mdBun

Serve `.md` files to `html` on `localhost:3000`on Linux or Termux on Android

Both `server.ts` and `package.json` were written by Claude free. I asked it to make a markdown to html server that would run using bun in a terminal by using bun's built-in markdown capability. I also asked it to render math and html for expandable content, and to simply open the .md file provided on the command line. What it came up with works perfectly without any dependencies but requires internet access in order to access highlight.js CDN and KaTeX. It offered to bundle KaTex and highlight.js locally to make it work offline, but I'd rather keep it working without dependencies. I wrote the desktop file and bash script with a little help from Copilot on the web.

### Linked Markdown files

Links to other `.md` files are rendered as HTML too, so a table of contents that links to one file per chapter works like a small website. Links into subfolders (`chapters/ch1.md`), back up (`../toc.md`), and to headings (`ch1.md#section-a`) all work. Only files inside the folder of a `.md` file you opened with `md` (and its subfolders) can be reached, so open the top-level file (e.g. the table of contents) rather than a chapter in a subfolder.

Following a link to a place in a page (`#id`: an index entry, a footnote, a heading) scrolls it to the middle of the window and briefly flashes it, so you can see where you landed. This also happens when the page is opened with that `#id` in its address, and again when you click the same link twice.

### Folders

`md some/folder` (or `md` with no argument, for the current folder) shows a page listing the folder's `.md` files, sorted so `chapter2.md` comes before `chapter10.md`, each with its `# title` beside the name. Subfolders are listed too if there is a `.md` file somewhere inside them (at any depth), and `../` leads back up as long as it's still inside a folder opened with `md`. Opening a folder lets its files and subfolders be reached, just like opening a file in it. The listing updates by itself when files are added, removed, renamed, or retitled.

### Browse and search

The 📂 button in the top-right corner opens a dialog listing the `.md` files in the current page's folder and its subfolders that have `.md` files somewhere inside, with `../` to go up (as far as folders opened with `md` allow). Picking a folder shows its contents in the dialog; picking a file shows it in the tab. Middle- or ctrl-clicking opens either in a new tab instead.

Typing in the dialog's search field and pressing **Search** (or Enter) looks through every `.md` file in the folder shown and all the folders below it, and lists the files that match, each with its number of matches. Search ignores case, looks at the text a page shows (so link addresses and Markdown markup don't count), and finds phrases even when they break across lines. Clicking a result opens that file with a find bar at the bottom, like the browser's Ctrl+F (which a page isn't allowed to open itself): every match is highlighted, it jumps to the first one, and it shows "1 of N". **Enter** or ▼ goes to the next match and **Shift+Enter** or ▲ to the previous one, wrapping around at the ends; each one is scrolled to the middle of the window and its paragraph flashes. You can change the words in the bar to find something else on the page. **Esc** or ✕ closes it and removes the highlighting. Searching for nothing goes back to the folder listing. Hidden folders (starting with `.`) and `node_modules` are skipped, and a search stops after 5000 files.

### Remembering your place

Each file opens where you were last reading it, in any tab and after restarting the server or the browser. The place is remembered as the paragraph at the top of the window rather than a distance, so it is still right when the window is a different width. A link to a place in the file (`#id`) or a search result still opens there instead.

When you leave where you were reading, by following a link within the page, stepping through search matches, or scrolling a long way (more than a window and a half without pausing), the ↩️ button appears in the top-right corner. It takes you back to where you were and flashes the paragraph; pressing it again returns you to where you pressed it, so you can go back and forth between the two places. Stepping through several matches or links in a row still leads back to where you were reading: a new place only replaces it once you have stayed there for half a minute. The button goes away when you scroll back there yourself. If a file opens somewhere other than where you left it (from a `#id` link or a search result), the button leads to where you left it.

Places are kept by the browser (in its storage for `localhost:3000`), not in the files.

### Light and dark

Pages follow the system's light or dark setting. The ☀️/🌙 button in the top-right corner switches between them; the choice applies to every tab and is remembered. Switching back to match the system forgets the choice, so pages follow the system again.

### Editing

The ✏️ button in the top-right corner turns editing on for the tab (it stays on when you follow links, until you press it again) and shows a bar of buttons. Every change is written to the `.md` file itself, and the page then reloads and flashes what changed. The buttons write the marks that [pdf2md](https://github.com/colinkeenan/pdf2md) keeps when it converts a book again, but they work in any Markdown file:

* **Click an equation** to correct it: its TeX opens with a preview that follows your typing, and KaTeX's complaint if it can't be typeset. **Save** (or Ctrl+Enter) writes it where it stands in the file. **Note after it…** and **Warning after it…** add one of your own under the equation instead.
* **Fix text**: select words the conversion got wrong, press the button, and type them as the book has them. They are written as `<span class="fix" data-was="as converted">as in the book</span>`, which reads as normal text. While editing, fixes are underlined with dots; click one to change it or to undo it.
* **Note**: select words and press the button to add a collapsible note of your own (`<details class="mine">`) after their paragraph. Tick the box to also put a ✎ marker right after the selected words (`<sup>[✎](#mine-N)</sup>`); clicking the marker opens the note.
* **Warning**: the same, for a box that is always visible (`> [!WARNING]`), e.g. where you think the book is wrong.
* **Equations to check** appears when the folder has a `check-equations.md` (pdf2md's list of the equations most worth comparing with the book) and opens it. Start with its "Big differences" section: each entry leads to its equation, which you then click to correct.

Notes and warnings are Markdown and can have `$math$` in them. To change or remove one later, edit the file.

To find selected words in the file, the page says which occurrence of them it is (the 3rd of 7, say) and the server counts the same words in the file. If the counts differ, because the selection has a formula, a link or *emphasis* in it, or is in a footnote, nothing is changed and you are asked to select a few plain words instead. Only pages served by mdBun can ask for changes, and only to `.md` files in folders opened with `md`.

### Multiple tabs

Each file gets its own address based on its full path, like `http://localhost:3000/home/me/book/toc.md`, so every tab can show a different file, from the same folder or different ones. Running `md` while the server is already running adds the file to it and opens a new tab, instead of restarting the server, so tabs that are already open keep working. The server keeps running until you stop it (e.g. `fuser -k 3000/tcp`). Restarting it means files in folders other than the one you start it with show "Not available" until you run `md` on them again.

Live reload watches only the folders of files being shown. Each tab reloads only when its own file, or an image it shows, changes, so editing one chapter doesn't disturb a tab showing another. Only one tab at a time keeps a connection open to the server for this and passes changes on to the others, because browsers allow just 6 connections to one server: if every tab kept its own, opening a 7th page would hang.

The server only listens on `127.0.0.1`, so other machines can't reach it.

Whether running on Linux or Termux on Android, the first step is to simply clone this repo.

### Linux

1. Edit `mdBun.destop` to have the correct path to an icon (or remove path to icon).
1. Put `mdBun.desktop` in `~/.local/share/applications`.
1. Edit `md` to have the correct path to `mdBun`, `chmod +x md`, and put `md` in `/usr/local/bin`.
1. In a file browser, set the default application for opening `.md` files to `mdBun`.
1. The desktop file also registers mdBun for folders (`inode/directory`) so it appears under **Open With** when you right-click a folder in Dolphin. So that it never takes over opening folders, make sure your file manager stays the default: `xdg-mime default org.kde.dolphin.desktop inode/directory`, then `update-desktop-database ~/.local/share/applications`.

Run in terminal with `md file.md` for whatever`file.md` you want, or `md folder` for a list of its `.md` files.  
Run in GUI by clicking the `.md` file from the file browser, or right-click a folder and choose **Open With → mdBun**.

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

## Licence

Copyright (C) 2026 Colin Keenan

mdBun is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version. It comes with no warranty. See [LICENSE](LICENSE) for the full text.
