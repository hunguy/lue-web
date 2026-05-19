# Lue — Agent Guide

Terminal eBook reader with TTS and a React web frontend. Python backend + React 19 frontend in a single repo.

## Tech Stack

- **Backend**: Python 3.10+, FastAPI, WebSockets, asyncio, `rich` (terminal UI)
- **Frontend**: React 19, Vite, TailwindCSS 4 (`@import "tailwindcss"`), Motion (Framer Motion)
- **Build**: setuptools (Python), Vite (frontend)
- **Deploy**: Docker multi-stage build (Node 20 → Python 3.11)

## Directory Structure

- `lue/` — Python package. Core modules:
  - `__main__.py` — CLI entry (`lue` command)
  - `reader.py` — Core `Lue` class (terminal + web logic)
  - `web.py` — FastAPI server, WebSocket `/ws`, static file serving
  - `config.py` — Config constants (TTS models, UI modes, PDF filters)
  - `content_parser.py`, `progress_manager.py`, `audio.py`, `ui.py`, `input_handler.py`, `timing_calculator.py`, `tts_manager.py`
  - `tts/` — TTS implementations: `base.py`, `edge_tts.py`, `kokoro_tts.py`
  - `keys_default.json`, `keys_vim.json` — Keyboard shortcut presets
- `lyricflow-ebook-reader/` — React frontend
  - `src/App.tsx` — Reader (lyrics-style highlighting)
  - `src/Bookshelf.tsx` — Library / upload / metadata management
  - `src/index.css` — Tailwind theme + custom animations
  - `dist/` — Built static assets (served by backend)

## Commands

### Setup
```bash
pip install -r requirements.txt
pip install .
```

### Run (Terminal mode)
```bash
python -m lue path/to/book.epub
lue --guide          # Navigation guide
```

### Run (Web mode)
```bash
python -m lue --web  # Serves on PORT (default 26516)
```

### Frontend (rebuild required for backend to see changes)
```bash
cd lyricflow-ebook-reader
npm install
npm run build        # Outputs to dist/
npm run lint         # tsc --noEmit only
```

### Docker
```bash
docker-compose up -d --build
```

## Key Conventions

- **No test suite** — There are no pytest/jest configs. Verify manually.
- **Frontend build is mandatory** — The backend serves `dist/` directly. Any change to `lyricflow-ebook-reader/src/` requires `npm run build` before `python -m lue --web` will reflect it.
- **Type hints** — `py.typed` is present; prefer typing in Python.
- **Async backend** — `Lue` and `WebLue` are heavily async. Audio playback, TTS generation, and UI updates run on an event loop.
- **Keyboard shortcuts** — Configurable via JSON. Presets: `"default"`, `"vim"`, or a file path. Loaded in `__main__.py:get_keyboard_shortcuts_file()`.
- **TTS models** — `"edge"` (default, online) and `"kokoro"` (offline, optional). Model selection affects voice IDs and overlap timing (`config.TTS_OVERLAP_SECONDS`).
- **Progress files** — Saved as `{book_name}.progress.json` in `platformdirs.user_data_dir("lue")`. Custom metadata (title, author, voice) is merged on save; never blindly overwrite.

## Critical Gotchas

### Audio & WebSocket
- **Browser audio caching** — Always append a cache-busting query param (`?t={time.time()}`) to audio URLs. The backend reuses buffer filenames.
- **Audio race on seek** — Wipe `audio_url` from React state immediately when a seek is requested, before setting the new URL. Otherwise `loadeddata` may fire for the old file.
- **Queue clearing** — `clear_queue` messages must clear audio URLs immediately (no timeout). A 150ms timeout previously raced with `new_sentence` and wiped the new audio.

### Frontend Performance
- **30k+ word chapters** — Do not render all words in React at once. The app uses a **Lazy Window** (~40 sentences) and selective prop passing to keep DOM updates scoped.
- **Swipe gestures** — Implemented with Motion's `drag="x"` on a container. Use `onTap` (not `onClick`) on the item, and guard with a `dragActiveRef` + 100ms debounce to distinguish swipe from tap.

### Backend Stability
- **Never `sys.exit()` in web mode** — Use `RuntimeError` and return HTTP 400 / WebSocket error instead. `sys.exit()` crashes the whole server process.
- **Voice change mid-playback** — Must increment `audio_generation`, cancel old restart tasks, call `stop_and_clear_audio()`, then `play_from_current_position()`. Extensive `[VOICE]`, `[RESTART]`, `[AUDIO]` logging exists to trace propagation.
- **Web mode initialization** — `WebLue._initialize_progress()` forces `is_paused = False`. The terminal and web modes have different startup behavior.

### Configuration
- **Port**: Default `26516`, override with `PORT` env var.
- **HMR**: The Vite config disables HMR when `DISABLE_HMR=true` (used in agent environments to prevent flicker). Do not remove this logic.
- **Path alias**: `@/` maps to `lyricflow-ebook-reader/` root in both Vite and TS config.

## Deployment

- Multi-stage `Dockerfile`: builds frontend, then copies `dist/` into Python image.
- Named volume `lue-data` for persistence.
- Requires `ffmpeg` system dependency (installed in Dockerfile; `brew install ffmpeg` locally).

## Related Files

- `handoff.md` — Previous session's detailed architecture notes and bug fixes.
- `lyricflow-ebook-reader/README.md` — Frontend-specific dev notes.

## Code Search

Use `semble search` to find code by describing what it does or naming a symbol/identifier, instead of grep:

​```bash
semble search "authentication flow" ./my-project
semble search "save_pretrained" ./my-project
semble search "save model to disk" ./my-project --top-k 10
​```

Use `semble find-related` to discover code similar to a known location (pass `file_path` and `line` from a prior search result):

​```bash
semble find-related src/auth.py 42 ./my-project
​```

`path` defaults to the current directory when omitted; git URLs are accepted.

If `semble` is not on `$PATH`, use `uvx --from "semble[mcp]" semble` in its place.

## Workflow

1. Start with `semble search` to find relevant chunks.
2. Inspect full files only when the returned chunk is not enough context.
3. Optionally use `semble find-related` with a promising result's `file_path` and `line` to discover related implementations.
4. Use grep only when you need exhaustive literal matches or quick confirmation of an exact string.
