# 🍍 Pineapple Pager Library

A web-based library for browsing **payloads**, **themes**, and **ringtones** for the [Hak5 WiFi Pineapple Pager](https://github.com/hak5/wifipineapplepager). Also aggregates **pull requests** from all three community repositories.

---

## Features

- **Payloads** — Browse 160+ payloads organized by category (Alerts, Recon, User) and subcategory, with full source code and README rendering
- **Themes** — Explore 40+ community themes with README previews, image galleries, and `theme.json` inspection
- **Ringtones** — Browse 100+ RTTTL ringtones with an in-browser player (Web Audio API)
- **Pull Requests** — View open/closed PRs from all three repos, with description rendering and state filtering
- **Search** — Full-text search across all tabs
- **Responsive** — Works on desktop and mobile

---

## How It Works

### Data Pipeline (`fetch_data.js`)

The data fetcher is a Node.js script that runs locally (or in CI) to produce a single `payloads.json` file consumed by the frontend.

```
npm run fetch
```

**Step 1 — Clone repositories**

Three GitHub repos are cloned (or updated via `git pull`) into `/tmp/`:

| Repository | Content |
|---|---|
| `hak5/wifipineapplepager-payloads` | Payload scripts (`.sh`) organized in category/subcategory dirs |
| `hak5/wifipineapplepager-themes` | Theme directories with `theme.json`, assets, and READMEs |
| `hak5/wifipineapplepager-ringtones` | RTTTL ringtone files (`.rtttl`) |

**Step 2 — Process payloads**

Walks the `payloads/` directory tree looking for `payload.sh` files. For each payload found:
- Reads `payload.sh` source code
- Parses the header comment block for metadata (title, author, description, category, etc.)
- Finds and reads the associated `README.md`
- Groups payloads into categories → subcategories

**Step 3 — Process themes**

Scans the `themes/` directory. For each theme:
- Reads `theme.json` for metadata (name, author, version)
- Reads `README.md` (or `README`) for description and author fallback

**Step 4 — Process ringtones**

Reads all `.rtttl` files from `ringtones/`. For each file:
- Parses the RTTTL format (`name:settings:notes`)
- Extracts the ringtone name, default settings, and note sequence

**Step 5 — Fetch pull requests**

Queries the GitHub API for open and closed PRs from all three repos (with pagination). Each PR includes title, author, state, labels, body (description), and source repository.

**Step 6 — Write output**

Everything is consolidated into a single `payloads.json`:

```json
{
  "fetchedAt": "2025-02-25T...",
  "categories": { ... },
  "totalPayloads": 164,
  "themes": [ ... ],
  "totalThemes": 43,
  "ringtones": [ ... ],
  "totalRingtones": 100,
  "pullRequests": [ ... ]
}
```

### Frontend (`index.html`, `app.js`, `style.css`)

A vanilla JavaScript single-page application — no frameworks, no build step.

- `app.js` fetches `payloads.json` on load and renders everything client-side
- Four main tabs switch between Payloads, Themes, Ringtones, and Pull Requests
- Payloads have sub-tabs for categories and a sidebar for subcategories
- Modals display full details (README rendering, source code, theme images, RTTTL playback)
- Simple markdown renderer handles headings, bold, italic, links, images, code blocks, and lists

---

## Quick Start

```bash
# 1. Fetch data (requires Node.js, git, and internet)
npm run fetch

# 2. Serve locally
npm run serve
```

Or just open `index.html` directly — it only needs the `payloads.json` file to exist.

---

## Project Structure

```
├── index.html        # Main HTML shell
├── app.js            # Client-side application logic
├── style.css         # All styles (dark theme, responsive)
├── fetch_data.js     # Data fetcher / processor (Node.js)
├── payloads.json     # Generated data file (gitignored)
└── package.json      # Scripts and metadata
```

---

## Notes

- **GitHub API rate limit**: Unauthenticated requests are limited to 60/hour. Set a `GITHUB_TOKEN` environment variable for higher limits.
- **No build step**: The frontend is plain HTML/CSS/JS — just serve the files.
- Data is sourced from the [hak5/wifipineapplepager](https://github.com/hak5/wifipineapplepager) ecosystem.

---

*For educational and authorized testing purposes only.*
*Created by [Z3r0L1nk](https://github.com/Z3r0L1nk)*
