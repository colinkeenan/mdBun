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
* **Corrections that last.** What you change with mdBun's editing buttons is written in the marks that pdf2md [keeps when it converts the book again](https://github.com/colinkeenan/pdf2md#correcting-and-annotating-a-book). Whether a change was made to match the original or [to improve it](#to-match-the-original-or-to-improve-it) is kept with it.
* **Equations to check.** pdf2md lists the equations it is least sure of in `check-equations.md`. mdBun adds a button for that list when the folder has one.
* **Index terms in blue.** Some words in a converted book are blue like links but do nothing when clicked. They are the words the book's index points to: pdf2md marks them so an index link can land on them, and mdBun colours every such mark. They are most noticeable in section titles.
* **Sentences that go on behind a picture.** Where a book breaks a sentence off for the pictures at the top of the next page, pdf2md writes the two parts in one block (`<div class="over-page">`) with the page's bar and the pictures between. mdBun sets the two parts as one run of words, so the line above the bar is filled to the right margin as on the printed page, and the sentence goes on under the last caption.
* **Tabs that say which book.** Every book has a "Contents" and a "Preface". A tab of a book's file is named by the author, the file's title and the book's: `Lucid "Chapter 4 Lagrangian Mechanics" Advanced Theoretical Physics`; for a course, by the school, which is left out of the title: `MIT "Readings" Relativistic Quantum Field Theory I`. Its icon has the book's own colour and the first letters of its title, so the tabs of one book look alike and unlike those of another. The title is the first heading of the folder's `book.md`; the author or school is in its first line, `<!-- pdf2md:by Lucid -->`, which pdf2md writes and you can change or add.
* **Page markers** in a converted book open that page of the PDF in a new tab. A phone's browser would open the PDF at its first page whatever the link says, so there mdBun shows the PDF in a viewer of its own (pdf.js, loaded from a CDN like KaTeX), which goes to the page.

In pdf2md's window, enter `md` as the Reader and "Open Book" starts mdBun on the book.

## Install

Install [Bun](https://bun.sh) and `curl`, and clone this repository. The commands below are run in the cloned folder.

`bun run build` makes the `md` command for your computer and puts it in the `build/` folder: it writes in where you cloned mdBun and where Bun is, so there is nothing to edit. `install` then copies it to where your system finds it. Run both again if you move the cloned folder.

### Linux

mdBun also needs `fuser` (package `psmisc`).

```sh
bun run build
install -Dm755 build/md ~/.local/bin/md
install -Dm644 build/mdBun.desktop ~/.local/share/applications/mdBun.desktop
install -Dm644 icon.svg ~/.local/share/icons/hicolor/scalable/apps/mdBun.svg
```

The second line installs the `md` command. The third adds mdBun to your desktop, so a file manager can open `.md` files with it; to finish, make mdBun the default application for `.md` files in your file manager. The fourth installs its icon.

`md` works in a terminal only if `~/.local/bin` is on your PATH. Not every distribution puts it there: check with `echo $PATH`. If it is missing, add `export PATH="$HOME/.local/bin:$PATH"` to `~/.profile` (zsh: `~/.zprofile`), or to `~/.bashrc` or `~/.zshrc`; in fish, run `fish_add_path ~/.local/bin`. Opening files from the file manager works without it.

The desktop file also offers mdBun under **Open With** for folders. To keep your file manager as the default for folders, run `xdg-mime default org.kde.dolphin.desktop inode/directory` (with your file manager's desktop file) and then `update-desktop-database ~/.local/share/applications`.

mdBun's icon is a bun fresh from the oven, carrying the Markdown mark. For another, such as your icon theme's `text-markdown`, change the `Icon=` line of the installed desktop file.

### Termux on Android

1. Allow Termux to display over other apps and to run in the background without battery limits.
2. Build `md`. Bun runs through `grun` in Termux, so start the build script with bash. It makes the Termux form of `md`, which expects Bun at `~/.bun/bin/bun`. You may need to install packages to get `grun` and `curl`.

   ```bash
   bash build.sh
   ```

3. Install it, and make it what Termux runs when another app sends it a file:

   ```bash
   install -Dm755 build/md $PREFIX/bin/md
   mkdir -p ~/bin
   ln -s $PREFIX/bin/md ~/bin/termux-file-editor
   ```

4. In a file manager such as Fluffy, tap a `.md` file, open it with Termux and choose "Edit". The file appears in your default browser.

**A home screen icon for a folder.** One tap on the icon shows the folder's listing in your browser.

1. Install [Termux:Widget](https://github.com/termux/termux-widget), which runs a script from `~/.shortcuts` when you tap its icon. Get it from the same place as Termux (F-Droid or GitHub): the two apps must be signed with the same key.

2. Make the script. In `tasks` it runs in the background, with no terminal window:

   ```bash
   mkdir -p ~/.shortcuts/tasks
   cat > ~/.shortcuts/tasks/Documents <<'EOF'
   #!/data/data/com.termux/files/usr/bin/sh
   exec "$PREFIX/bin/md" ~/Documents
   EOF
   chmod 700 ~/.shortcuts ~/.shortcuts/tasks
   chmod +x ~/.shortcuts/tasks/Documents
   ```

   `~` is Termux's own home folder. For the phone's Documents folder, run `termux-setup-storage` once and use `~/storage/shared/Documents` in the script.

3. Give it mdBun's icon: a PNG with the script's name, in `~/.shortcuts/icons`. Run this in the cloned folder, before the next step, because the widget takes its icon when you add it:

   ```bash
   mkdir -p ~/.shortcuts/icons
   chmod 700 ~/.shortcuts/icons
   cp icon.png ~/.shortcuts/icons/Documents.png
   ```

4. Long-press the home screen, choose Widgets, drag the Termux:Widget shortcut (the small one, not the list) onto the screen and pick `Documents`.

The server keeps running with no Termux window open, and after you swipe Termux:Widget away. `md` takes Termux's wake lock for that, which Termux's notification shows as "wake lock held"; without it, Android freezes the server after some pages. `md --stop` gives the lock back.

If a tap does nothing, move the script up to `~/.shortcuts/Documents`: there it runs in a terminal, where you can read the error.

## Use

```sh
md notes.md     # show a file
md book/        # list a folder's Markdown files
md              # the same, for the current folder
md --stop       # stop the server
md --editor kate   # name your editor, for the page's Editor button
```

On Linux you can also click a `.md` file in the file manager, or right-click a folder and choose **Open With → mdBun**.

The first `md` starts the server. Later ones add their file to the running server and open a new tab, so open tabs keep working. The server runs until you stop it with `md --stop`. Stop it after you update mdBun (`git pull`), too: it loads its code when it starts, so a running server keeps the old version until the next `md` starts a new one. It listens only on `127.0.0.1`, so other machines cannot reach it.

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
* **Fix text**: select what is wrong and press the button. [The dialog](#fixing-text) shows the selection as the file writes it, in Markdown, for you to change. Both dialogs ask what the change is for: [to match the original or to improve it](#to-match-the-original-or-to-improve-it). While editing, fixes are underlined with dots; click one to change or undo it. Words in a table can be fixed the same way, also in the title and the note that pdf2md sets across the top and the foot of a table.
* **Note**: select words and press the button to add a collapsible note after their paragraph. Tick the box to also put a ✎ marker after the selected words; clicking the marker opens the note.
* **Warning**: the same, as a box that is always visible, for example where you think the book is wrong.
* **🔬 See the Markdown**: select anything (words, bold text, a link, a list, a table, a formula) and press the button to see how it is written in the file. The selection is highlighted within the whole of its paragraphs. Nothing is changed, so it may be of anything: several paragraphs, a list, a displayed equation.
* **Editor**: opens the file in [your own editor](#your-editor), at what you selected.
* **Equations to check** opens `check-equations.md` if the folder has one.

**A corrected equation in a book from pdf2md** is written so that pdf2md keeps it when it converts the book again:

* One that pdf2md read from a picture is corrected where it stands. pdf2md knows it by its picture.
* One that pdf2md built from the PDF's text has no picture. A displayed equation gets a mark above it that holds the equation as converted, `<!-- pdf2md:fix … -->`. A formula in a sentence is wrapped as a fix, like corrected words, together with a few of the words around it if the same formula stands earlier in the line.

Correct it back to what was converted, and the mark or the fix is gone again. pdf2md corrects every displayed equation of the chapter that it converts to the same LaTeX, so a mistake the conversion makes several times needs correcting once. That goes for both forms of math, a block fenced with ```` ```math ```` and one between lines of `$$`. In a folder that pdf2md did not write, an equation is simply corrected where it stands.

Notes and warnings are Markdown and can hold math. To change or remove one, click it while editing. **Delete** has to be pressed twice, since what you wrote is gone for good.

Two limits:

* **A selection must be found in the file for sure.** The page tells the server which occurrence of the selection it means, and the server counts the same in the file. The selection may run over formulas, links, bold words and tags. The counts differ if the file writes something in it differently than the page shows it (`&amp;` for &, an emoji's `:name:`), or if it is in a footnote. Nothing is changed then, and you are asked to select a little more or less.
* **Alert boxes inside a list, a footnote or another quote** cannot be told apart from the page, so in a file that has one, change alert boxes in the file itself.

Only pages served by mdBun can ask for changes, and only to `.md` files in folders opened with `md`.

#### Fixing text

A fix is of whatever you select in one paragraph: words, with the formulas among them and with their formatting. Where the book has "the $z-$ direction", select the formula and the word behind it, and the dialog shows

```
<span class="fix" data-was="&#36;&#96;z -&#96;&#36; direction">
$`z -`$ direction
</span>
```

The first and the last line are the tags the fix is written between, as they will stand in the file. Between them is the Markdown of what you selected, which is yours to change: to ``$`z`$-direction``, or to anything else. What you type is written as you type it, so it may be Markdown, formulas and HTML (`<sub>`, `<br>`), and a space is there or gone as you leave it.

**Style…** opens a field for CSS that the opening tag is to have. `white-space:nowrap;` keeps the words of the fix on one line, so that "z-direction" is not broken behind its hyphen. The tag shows the style as you type it. A style can be all there is to a fix: leave the words as they are and they are written between the tags unchanged. Whatever else you write into the tag in the file itself, a `title` for instance, stays when the fix is changed from the page.

The converted text is kept in `data-was`, where the `$` and the backticks of a formula are written `&#36;` and `&#96;`, as pdf2md writes them, so that no program takes it for a formula of the page. **Undo this fix** puts the converted text back and takes the tags away.

What a fix can't be of:

* **A displayed equation**, or words of more than one paragraph. Click the equation to correct it.
* **Words inside code.**
* **A part of something that has to stay whole**: the first words of a link with the words behind the link, half of what is bold, half of what a tag holds. Select all of it, or only words inside it. (A selection that begins with the first word of a link or of bold words and goes on beyond their last takes their marks in.)
* **A part of an earlier fix.** Click that fix, or select all of its words and no others.

In a book from pdf2md, a formula that was read from a picture has pdf2md's mark of the picture behind it, `<!-- pdf2md:eq … -->`, and the dialog shows the mark. Leave it right behind its formula, or take it out with the formula. Such a formula is corrected per picture, so pdf2md converts it corrected from then on; the converted text that the fix keeps is written with the formula as you corrected it, and pdf2md finds the place of the fix again.

#### To match the original or to improve it

A fix or a corrected equation is one of two things, and its dialog has a radio button for each:

* **To match the original.** The conversion got the book wrong and you put it right. This is the usual case and the one that is selected. The page then reads as the book does, so nothing marks the change unless you are editing.
* **To improve the original.** The book itself is wrong, or could say it better, and you change what it says. These changes are shown in purple on every page, editing or not, so you always see where the text is not the book's. Pointing at one says what the original has.

Click a fix or an equation while editing to change which of the two it is.

In the file, an improving fix has one more attribute, `<span class="fix" data-was="…" data-to="improve">`, and an improved equation has the comment `<!-- mdBun:improved -->` behind it: right behind a formula in a sentence, on the next line under a displayed one. A change without either is one to match the original, as all were before there was a choice. Notes and warnings are your own words in a box of their own and are not asked about.

#### Your editor

**Editor** opens the page's file in the editor you name, with the cursor at the start of what you selected: words, a formula, or anything 🔬 can find. With nothing selected it opens at the first paragraph the window shows.

Name the editor once, in a terminal:

```sh
md --editor kate                # an editor mdBun knows
md --editor 'konsole -e nvim'   # one that runs in a terminal, and the terminal to open
md --editor 'myedit --at {line}:{column} {file}'   # any other: say where the place goes
md --editor                     # which is set
md --editor ""                  # forget it
```

mdBun knows how these are told a line and a column: VS Code and its relatives (`code`, `codium`, `cursor`, `windsurf`), `zed`, `subl`, `kate`, `kwrite`, `gedit`, `geany`, `emacs`, `emacsclient`, `gvim`, `neovide`, and in a terminal `nvim`, `vim`, `hx`, `nano`, `micro` and `kak`. Any other editor is given `+line file`, which most understand. If yours needs something else, write the command out with `{file}`, `{line}` and `{column}` where they belong (`{byte}` is the column counted in bytes, as vim counts it).

With no editor named, mdBun uses `$VISUAL` or `$EDITOR`, as they were when the server started. An editor that runs in a terminal is opened in a terminal window: `$TERMINAL`, your desktop's own, or the first one found.

**In Termux the editor may be an Android app**, named by its package: `md --editor com.adeeteya.markdown_editor` (or `package/.Activity` for one screen of an app). Android is asked to show the file in that app, as `termux-open` asks for any app. Two things differ from an editor on a computer. An app cannot be told a line, so the file opens at its start. And the app is let read the file, not write it: what you change there reaches the file only if the app can save over it by its own means, with "Save as" onto a file in shared storage for instance. An editor that runs in Termux (`nvim`, `micro`) has neither limit; for those mdBun shows the command to paste.

**When mdBun cannot start the editor**, it shows the command that would, with a **Copy** button, for you to paste into a terminal. That happens when no editor is named, when the editor is not installed where the server looks, when it fails to start, and when it needs a terminal and there is none to open, as in Termux.

The editor is always the one named on your computer, never one named by a page: a Markdown file can hold a script, and a page must not be able to choose what is run. The setting is kept in `~/.config/mdBun/editor`.

### Math

mdBun reads math in four forms: `$…$` and `$$…$$`, and the two that GitHub shows correctly whatever the formula contains, ``$`…`$`` in a sentence and a block fenced with ```` ```math ````. All four look the same in mdBun.

A displayed formula is fitted to the width it has, so that on a phone it need not be scrolled sideways and never runs into its number. A formula that is too wide is, in this order:

1. broken before its relation signs (`=`, `≈`, `→` and the like), the lines after the first lined up at the sign, its number beside it;
2. given the whole width, its number on a row of its own under it at the right;
3. broken before plus and minus signs too: first outside brackets, then inside them (a bracket set with `\left … \right` is closed at the line's end and opened again on the next, invisibly);
4. left as it is, to be scrolled sideways, if none of that is enough: a wide matrix, a long fraction or root.

A formula already in lines (`aligned`, also inside the braces of a system or a `\boxed` frame) has its lines broken the same way. The number is taken from a `\tag{…}` at the formula's end, or from the text pdf2md writes there for GitHub. Formulas near what the window shows are fitted first, the rest while the browser is idle; turning the phone or resizing the window fits them again.

### Tabs and reloading

Each file has its own address from its full path, such as `http://localhost:3000/home/me/book/toc.md`, so every tab can show a different file. A tab reloads only when its own file, or an image it shows, changes.

## History

The first `server.ts` was written in a chat with Claude: a Markdown-to-HTML server on Bun's built-in Markdown, with math and expandable content. Colin Keenan wrote the `md` script and the desktop file. Since November 2026 the rest has been written by Claude in [Claude Code](https://claude.com/claude-code) (Opus 5.5, then Fable 5.2), working from his requests. Each commit says which model wrote it.

## Licence

Copyright (C) 2026 Colin Keenan

mdBun is free software under the GNU Affero General Public License, version 3 or later. It comes with no warranty. See [LICENSE](LICENSE) for the full text.
