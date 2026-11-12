# mdBun

mdBun shows Markdown files in your browser. Run `md book/` or `md notes.md` and the file opens as a web page on `localhost:3000`, with math typeset, links between files working, and a tab per file. It runs on Linux and in Termux on Android, on [Bun](https://bun.sh) with no other dependencies.

It was written to read textbooks converted by [pdf2md](https://github.com/colinkeenan/pdf2md), but it works with any folder of Markdown.

## What it does

* **Renders GitHub-style Markdown**, including tables, footnotes (`[^1]`), alert boxes (`> [!NOTE]`), collapsible `<details>`, emoji shortcodes and raw HTML.
* **Typesets math** with KaTeX and highlights code with highlight.js. Both are loaded from a CDN, so they need an internet connection; without one the page shows the TeX source.
* **Follows links between files**, so a table of contents that links to one file per chapter works like a small website.
* **Lists a folder's Markdown files**, and lets you browse and search them from any page.
* **Remembers your place** in every file.
* **Edits the file from the page**: correct an equation, fix a word, add a note.
* **Reloads a page** when its file changes.

## Reading books from pdf2md

[pdf2md](https://github.com/colinkeenan/pdf2md) converts a PDF textbook into a folder of Markdown: one file per chapter, formulas as LaTeX, and the contents, index and footnotes as links. The two programs are made to work together.

* **Math in either form.** pdf2md can write formulas [for GitHub or in the standard form](https://github.com/colinkeenan/pdf2md#math-github-or-standard). mdBun reads both and shows them the same, with equation numbers at the right margin.
* **Corrections that last.** What you change with mdBun's editing buttons is written in the marks that pdf2md [keeps when it converts the book again](https://github.com/colinkeenan/pdf2md#correcting-and-annotating-a-book).
* **Equations to check.** pdf2md lists the equations it is least sure of in `check-equations.md`. mdBun adds a button for that list when the folder has one.
* **Page markers** in a converted book open that page of the PDF in a new tab.

In pdf2md's window, enter `md` as the Reader and "Open Book" starts mdBun on the book.

## Install

Clone this repository and install [Bun](https://bun.sh). The `md` script also needs `curl`, and on Linux `fuser` (package `psmisc`).

### Linux

1. In `md`, set the path in the `cd` line to where you cloned mdBun. Then `chmod +x md` and copy it to `/usr/local/bin`.
2. In `mdBun.desktop`, set `Icon=` to an icon of your choice, or remove the line. Copy the file to `~/.local/share/applications`.
3. In your file manager, make mdBun the default application for `.md` files.

The desktop file also offers mdBun under **Open With** for folders. To keep your file manager as the default for folders, run `xdg-mime default org.kde.dolphin.desktop inode/directory` (with your file manager's desktop file) and then `update-desktop-database ~/.local/share/applications`.

### Termux on Android

1. Allow Termux to display over other apps and to run in the background without battery limits.
2. Use this `md` in place of the one in the repository. It differs in the launcher (`grun`), in how it stops an old server, and in how it opens the browser. You may need to install packages to get `grun` and `curl`.

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

3. Install it, and make it what Termux runs when another app sends it a file:

   ```bash
   chmod +x md
   mv md /data/data/com.termux/files/usr/bin/md
   ln -s /data/data/com.termux/files/usr/bin/md ~/bin/termux-file-editor
   ```

4. In a file manager such as Fluffy, tap a `.md` file, open it with Termux and choose "Edit". The file appears in your default browser.

## Use

```sh
md notes.md     # show a file
md book/        # list a folder's Markdown files
md              # the same, for the current folder
```

On Linux you can also click a `.md` file in the file manager, or right-click a folder and choose **Open With → mdBun**.

The first `md` starts the server. Later ones add their file to the running server and open a new tab, so open tabs keep working. The server runs until you stop it, for example with `fuser -k 3000/tcp`. It listens only on `127.0.0.1`, so other machines cannot reach it.

**Which files can be reached.** A page can link to any `.md` file in a folder you opened with `md`, or below it, and to nothing outside. Open the top-level file or the folder itself, not a chapter in a subfolder. After the server restarts, folders other than the one it was started with show "Not available" until you run `md` on them again.

Two environment variables change the server: `PORT` sets a port other than 3000, and `LIVE_RELOAD=0` turns reloading off.

### Links

Links to other `.md` files, into subfolders, back up (`../toc.md`) and to headings (`ch1.md#section-a`) all work. Following a link to a place in a page, such as an index entry or a footnote, scrolls that place to the middle of the window and flashes it briefly, so you can see where you landed.

### Folders, browsing and search

A folder's page lists its `.md` files in natural order (`chapter2.md` before `chapter10.md`), each with its title, and the subfolders that hold Markdown somewhere inside. The list updates itself when files change.

The 📂 button on any page opens the same listing in a dialog. Pick a file to show it in the tab; middle-click or Ctrl-click opens it in a new tab.

Type in the dialog's search field and press **Search** to look through every `.md` file in the folder shown and below it. Search ignores case, looks at the text a page shows and not at markup or link addresses, and finds phrases that break across lines. The results list each matching file with its number of matches.

Clicking a result opens the file with a find bar at the bottom. Every match is highlighted. **Enter** or ▼ goes to the next match, **Shift+Enter** or ▲ to the previous one, and **Esc** closes the bar. You can change the words in the bar to find something else on the page.

Search skips hidden folders and `node_modules`, and stops after 5000 files.

### Your place

Each file opens where you were last reading it, in any tab and after a restart of the server or the browser. The place is kept as the paragraph at the top of the window, so it is still right at a different window width. A link to a place in the file, or a search result, opens there instead.

When you leave where you were reading, by following a link within the page, stepping through matches, or scrolling a long way, a ↩️ button appears. It takes you back; pressing it again returns you to where you pressed it. A new place replaces the old one only after you have stayed there for half a minute, so a chain of links still leads back to where you started.

Places are kept by the browser, in its storage for `localhost:3000`, not in the files.

### Light and dark

Pages follow the system's light or dark setting. The ☀️/🌙 button switches, for every tab, and the choice is remembered. Switching back to what the system uses makes pages follow the system again.

### Editing

The ✏️ button turns editing on for the tab and shows a bar of buttons. Every change is written to the `.md` file itself; the page then reloads and flashes what changed.

* **Correct an equation**: click it. Its TeX opens with a preview that follows your typing and shows KaTeX's complaint if it cannot be typeset. **Save** or Ctrl+Enter writes it.
* **Fix text**: select the words that are wrong, press the button and type them as they should be. The fix is written as `<span class="fix" data-was="…">`, which reads as normal text. While editing, fixes are underlined with dots; click one to change or undo it.
* **Note**: select words and press the button to add a collapsible note after their paragraph. Tick the box to also put a ✎ marker after the selected words; clicking the marker opens the note.
* **Warning**: the same, as a box that is always visible, for example where you think the book is wrong.
* **Equations to check** opens `check-equations.md` if the folder has one.

Notes and warnings are Markdown and can hold math. To change or remove one, click it while editing. **Delete** has to be pressed twice, since what you wrote is gone for good.

Two limits:

* **Selections must be plain words.** The page tells the server which occurrence of the selected words it means, and the server counts the same words in the file. If the selection includes a formula, a link or emphasis, or is in a footnote, the counts differ. Nothing is changed and you are asked to select a few plain words instead.
* **Alert boxes inside a list, a footnote or another quote** cannot be told apart from the page, so in a file that has one, change alert boxes in the file itself.

Only pages served by mdBun can ask for changes, and only to `.md` files in folders opened with `md`.

### Math

mdBun reads math in four forms: `$…$` and `$$…$$`, and the two that GitHub shows correctly whatever the formula contains, ``$`…`$`` in a sentence and a block fenced with ```` ```math ````. All four look the same in mdBun.

### Tabs and reloading

Each file has its own address from its full path, such as `http://localhost:3000/home/me/book/toc.md`, so every tab can show a different file. A tab reloads only when its own file, or an image it shows, changes.

## History

The first `server.ts` was written in a chat with Claude: a Markdown-to-HTML server on Bun's built-in Markdown, with math and expandable content. Colin Keenan wrote the `md` script and the desktop file. Since November 2026 the rest has been written by Claude in [Claude Code](https://claude.com/claude-code) (Opus 5.5, then Fable 5.2), working from his requests. Each commit says which model wrote it.

## Licence

Copyright (C) 2026 Colin Keenan

mdBun is free software under the GNU Affero General Public License, version 3 or later. It comes with no warranty. See [LICENSE](LICENSE) for the full text.
