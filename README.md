# Luna Plugins

A collection of **[Tidal Luna](https://github.com/Inrixia/TidaLuna)** plugins.

## Plugins

### FilteredQueueFix

Keeps the playback queue in sync with the in-playlist filter so "Next" stays within filtered results.

**The Problem:** When you filter a playlist in Tidal and start playing a track, the queue still contains **all** tracks from the playlist — not just the ones matching your filter. Pressing "Next" jumps to unrelated tracks outside your filter.

**How It Works:** Intercepts queue-building Redux actions and replaces the full track list with only the tracks matching the current filter text. Matches against track title, version, artist name(s), and album title. Shuffle is respected.

**Demo:**

https://github.com/user-attachments/assets/e247e855-11e3-4216-8a31-6c0f641f2f8d

### PlaylistIndicator

Shows which playlists already contain a track in the "Add to Playlist" menu.

**The Problem:** Tidal's "Add to playlist" popup doesn't show whether a track is already in any of the listed playlists, making it easy to add duplicates.

**Demo:**

https://github.com/user-attachments/assets/9b1f3260-0c2a-4462-91b7-442b5a92b0f2

**How It Works:**
- Adds a green **✓** checkmark next to playlist names that already contain the track
- Works in both the "+" button popup and the three-dots context menu's "Add to playlist" submenu
- When a duplicate is detected and Tidal shows the "This track is already in your playlist" dialog, a **"Remove from Playlist"** button is injected alongside "Cancel" and "Add Anyway" — removing all occurrences of the track from that playlist

### ScrollToPlaying

Highlights the currently playing track and source playlist, auto-scrolls to the playing track, and adds a scroll-to-playing button.

**The Problem:** When using Tidal Connect (remote playback), the desktop app doesn't highlight which track is currently playing in the playlist, making it hard to find it — especially in long playlists. It's also unclear which playlist the music is playing from.

**Features:**
- **Track row highlight** — the currently playing track row is highlighted with a colored background, left accent bar, and tinted text
- **Source playlist highlight** — the playlist the queue was built from is highlighted in the sidebar
- **Auto-scroll on track change** — when the track changes, the playlist automatically scrolls to the playing track (toggleable in settings)
- **Scroll-to-playing button** — a floating arrow button appears when the playing track is scrolled out of view, pointing toward it; click to scroll back
- **Configurable colors** — highlight color (RGB) and background opacity are adjustable in settings

**How It Works:** Intercepts Tidal Connect `MEDIA_CHANGED` events and syncs the play queue index. Detects the source playlist by matching queue tracks against loaded track lists. Scrolls the `<main>` container using position estimation for virtualized lists, with a refinement pass once the track row renders.

## Installation

Install individual plugins from the releases page:

```
https://github.com/squadgazzz/luna-plugins/releases/download/latest/luna.filtered-queue-fix
```

```
https://github.com/squadgazzz/luna-plugins/releases/download/latest/luna.playlist-indicator
```

```
https://github.com/squadgazzz/luna-plugins/releases/download/latest/luna.scroll-to-playing
```

Or install the full store:

```
https://github.com/squadgazzz/luna-plugins/releases/download/latest/store.json
```
