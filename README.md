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

**How It Works:**
- Adds a green **✓** checkmark next to playlist names that already contain the track
- Works in both the "+" button popup and the three-dots context menu's "Add to playlist" submenu
- When a duplicate is detected and Tidal shows the "This track is already in your playlist" dialog, a **"Remove from Playlist"** button is injected alongside "Cancel" and "Add Anyway" — removing all occurrences of the track from that playlist

## Installation

Install individual plugins from the releases page:

```
https://github.com/squadgazzz/luna-plugins/releases/download/latest/luna.filtered-queue-fix
```

```
https://github.com/squadgazzz/luna-plugins/releases/download/latest/luna.playlist-indicator
```

Or install the full store:

```
https://github.com/squadgazzz/luna-plugins/releases/download/latest/store.json
```
