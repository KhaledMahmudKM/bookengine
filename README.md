# bookengine

Turn a folder of Markdown chapters into a clean two-pane web book: the table of contents on the left, the chapter on the right. No build step and no server code. It's a static site, so it runs on GitHub Pages or any static host.

**Features:** collapsible Parts in the table of contents · light and dark themes · a shareable link for every chapter and section · syntax highlighting with Copy buttons · ←/→ page turns · a mobile layout · print styles · optional maths (MathJax) · a small plugin API for interactive widgets.

```
my-book/
  index.html             small; loads the engine
  book.json              title, author, options
  chapters/
    chapters.json        reading order and Part dividers
    home.md              the opening page
    01-introduction.md
    02-....md
  images, assets/ ...    anything the chapters reference
```

The engine (`bookengine.js` + `bookengine.css`) lives in this repo. Each book loads a pinned release of it from jsDelivr, so one engine serves any number of books and an engine change never reaches a book until that book opts in.

## Start a book

1. Copy the [`template/`](template) folder into a new repo.
2. In `index.html`, set the `<title>`, the description `<meta>` and the favicon. Those lines are shown in link previews before any JavaScript runs.
3. Edit `book.json` and write your chapters.
4. Publish. On GitHub: Settings → Pages → deploy from the main branch, root folder.

## Preview on your machine

Keep the engine and your books side by side in one folder, then run a web server in that folder:

```
~/books/
  bookengine/          ← a clone of this repo
  my-book/
  another-book/
```
```bash
cd ~/books
python3 -m http.server 8000
# open http://localhost:8000/my-book/
```

On `localhost`, a book looks for the engine in a sibling `../bookengine/` folder first. Your edits to the engine and to your books show up together on reload, before anything is published. If there's no sibling folder, the book quietly uses its pinned release from the CDN instead, and the browser console shows one harmless 404 for the folder it tried first.

On a published site, books always use the pinned release.

You need internet either way: the Markdown renderer and syntax highlighter come from CDNs. Opening `index.html` directly as a file won't work, because browsers block `fetch()` from `file://` pages.

## book.json

| Key | Meaning |
|---|---|
| `title` | **Required.** Shown in the header and browser tab |
| `copyright` | Footer text |
| `author`, `description` | Fill the author and description meta tags if `index.html` doesn't |
| `homeLabel` | TOC label for `home.md` (default `"Preface"`) |
| `homeUrl` | Makes the header logo and title a link, e.g. back to your site. No link if omitted |
| `logo` | Header logo image. An `.svg` is inlined, so `stroke="currentColor"` follows the theme's accent colour. Default: an open-book icon |
| `theme` | Colour and font overrides; see [Theming](#theming) |
| `fonts` | A Google Fonts stylesheet URL to use instead of the default Inter + JetBrains Mono, or `false` to load no webfonts |
| `themeColor` | Mobile browser bar colour (default `#5a9e2f`) |
| `math` | `true` loads MathJax for `$…$` and `$$…$$`. Leave it off unless you need it: it's about 1 MB |
| `highlightLanguages` | Extra highlight.js languages beyond the common set, e.g. `["django"]` for Jinja, `["dockerfile", "nginx"]` |
| `codeCopy` | `false` hides the Copy button on code blocks |
| `styles` | Extra stylesheets, loaded after the theme |
| `scripts` | Plugin scripts, loaded **in order** before the first chapter renders |

Paths are relative to the book. Full `https://` URLs also work. Any other keys (`year`, `version`, …) are ignored, so you can keep notes there.

## chapters.json

An array in reading order. Each entry is one of:

```json
"01-introduction.md"                                  // title read from the file's first "# " heading
{ "file": "02-setup.md", "title": "Setup" }           // title given here instead
{ "separator": "Part II · Applications" }             // starts a collapsible Part
```

`home.md` is always first and isn't listed.

## Writing chapters

- **Title.** The first `# ` heading becomes the chapter's title in the TOC and the prev/next buttons.
- **Links between chapters.** Write ordinary Markdown links to the file: `[setup](02-setup.md)`, or to a section: `[ports](02-setup.md#opening-ports)`. They're rewritten to work in the reader.
- **Links within a chapter.** `[see below](#some-heading)` scrolls to that heading.
- **Section ids.** Each heading gets an id from its text, lowercased with spaces turned into hyphens. Hovering a heading shows a `#` link to copy.
- **Images.** Paths are relative to the book root, not to `chapters/`, because the page is `index.html`. So write `![Cover](cover.jpg)` or `assets/diagram.png`. Resize large images first: 1600px wide is plenty.
- **Placeholders.** Put `<like_this>` text in backticks. Bare angle brackets are read as HTML tags and disappear.
- **HTML.** Raw HTML is allowed. That's how plugin containers like `<div id="calc1"></div>` are placed.

## Links

| URL | Opens |
|---|---|
| `…/my-book/` or `…/my-book/#/` | `home.md` |
| `…/my-book/#/02-setup` | `chapters/02-setup.md` |
| `…/my-book/#/02-setup/opening-ports` | That chapter, scrolled to a section |

The address comes from the file name, so **renaming a chapter file breaks existing links to it**. Settle file names before sharing.

## Theming

Every colour and both font stacks are CSS variables in `bookengine.css`. Override any of them per book. The `--` prefix is optional:

```json
"theme": {
  "light": { "accent": "#1f6feb", "accent-dim": "#9cc2ff", "accent-glow": "rgba(31,111,235,0.13)" },
  "dark":  { "accent": "#58a6ff", "accent-dim": "#1f4f8f", "accent-glow": "rgba(88,166,255,0.15)" }
}
```

| Variables | What they colour |
|---|---|
| `bg`, `bg-soft` | Page background, callouts and code blocks |
| `panel`, `panel-hover` | The chapter card, buttons |
| `border`, `border-soft` | Lines and outlines |
| `text`, `text-dim`, `text-faint` | Body text, secondary text, hints |
| `accent`, `accent-dim`, `accent-glow` | Links, logo, active chapter, focus rings |
| `mono`, `sans` | Font stacks; pair with `fonts` to load the faces |

For anything beyond variables, add your own stylesheet with `styles`.

## Plugins

A plugin is a script listed in `scripts`. It registers hooks that run each time a chapter is rendered:

```js
// After one particular chapter renders
BookEngine.onChapter("08-pbkdf2.md", ({ el, file, book }) => {
  // el: the rendered chapter <article>; book: the parsed book.json
});

// After every chapter renders
BookEngine.onChapter(({ el, file }) => { /* ... */ });
```

Chapters are re-rendered on every visit, so hooks run each time and should rebuild their widget from scratch. Style widgets with the theme variables above and they will follow light/dark automatically.

The *Concise Book on Cryptographic Hashes* is a full example: its `assets/hashcalc.js`, `book.js` and `hashcalc.css` add a live hash calculator to each chapter.

## Releasing a new engine version

1. Change `bookengine.js` / `bookengine.css` and update `VERSION` at the top of `bookengine.js`.
2. Preview a few books against it locally (see [Preview on your machine](#preview-on-your-machine)).
3. Commit and push, then create a tag for that commit, either way:
   - **On GitHub:** the repo's **Releases** → **Draft a new release** → **Choose a tag** → type `1.1.0` → **Create new tag** → **Publish release**.
   - **From the command line:**
     ```bash
     git tag 1.1.0
     git push origin main --tags
     ```
4. In each book's `index.html`, change the version in the `ENGINE` URL to `@1.1.0`, then commit.

Some rules:

- **Never move or reuse a tag.** jsDelivr caches tagged files permanently.
- **Don't point books at `@main`.** Branch URLs are cached for hours, so readers would get unpredictable versions.
- **Use plain version numbers as tags** (`1.1.0`, not `v1.1.0`), so the tag and the URL match exactly.

## Pinned libraries (1.0.0)

| Library | Version | Loaded |
|---|---|---|
| marked | 18.1.0 | always |
| highlight.js | 11.11.1 | always (+ `highlightLanguages`) |
| github-markdown-css | 5.8.1 | always |
| MathJax | 3.2.2 | only with `"math": true` |
| Inter, JetBrains Mono | Google Fonts | unless `fonts` says otherwise |

Upgrading any of these is an engine release like any other.

## Licence

MIT. See [LICENSE](LICENSE).
