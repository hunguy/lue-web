# LyricFlow Ebook Reader (Web Frontend)

The web-based "read-along" interface for the `lue` ebook reader. This frontend provides an Apple Music-style lyrics experience, synchronizing text with the backend's TTS engine.

## Features

- **Immersive Header**: Large cover art, marquee titles for long names, and clear chapter progress.
- **Cinematic Lyrics**: Smooth, word-level highlighting with high-performance windowed rendering.
- **Intelligent Navigation**: Back-to-bookshelf navigation and automatic progress resumption.
- **Interactive Progress Bar**: Precision time indicators (elapsed/remaining) and hover-to-seek tooltip.
- **Performance Optimized**: Lazy Window rendering and selective prop passing ensure fluid 60fps playback even in chapters with 30,000+ words.

## Tech Stack

- **Framework**: React 19
- **Build Tool**: Vite
- **Styling**: TailwindCSS 4 (using `@import "tailwindcss"`)
- **Animations**: Motion (Framer Motion)
- **Virtualization**: Custom Lazy Window implementation for animation fidelity.

## Development

1. **Install Dependencies**:
   ```bash
   npm install
   ```

2. **Build for Production**:
   ```bash
   npm run build
   ```
   *Note: The backend serves files from the `dist` directory, so a build is required for changes to reflect in the main application.*

3. **Running in the project**:
   From the project root directory:
   ```bash
   python -m lue --web
   ```

## Design Philosophy

This frontend prioritizes visual quality and focus. By dimming non-active sentences and using a large-scale header, it transforms reading into a passive listening experience with high-fidelity visual accompaniment.
