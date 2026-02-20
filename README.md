# FilteredQueueFix

A **[Tidal Luna](https://github.com/Inrixia/TidaLuna)** plugin that keeps the playback queue in sync with the in-playlist filter so "Next" stays within filtered results.

## The Problem

When you filter a playlist in Tidal and start playing a track, the queue still contains **all** tracks from the playlist — not just the ones matching your filter. Pressing "Next" jumps to unrelated tracks outside your filter.

## Demo

https://github.com/user-attachments/assets/e247e855-11e3-4216-8a31-6c0f641f2f8d

## How It Works

FilteredQueueFix intercepts queue-building Redux actions (`ADD_TRACK_LIST_TO_PLAY_QUEUE`, `FETCH_FIRST_PAGE_AND_ADD_TO_QUEUE`, `ADD_ALREADY_LOADED_ITEMS_TO_QUEUE`) and replaces the full track list with only the tracks matching the current filter text. It matches against track title, version, artist name(s), and album title.

Shuffle is respected — when enabled, a random seed is passed so the filtered queue is shuffled as expected.

## Installation

Install from the releases page:

```
https://github.com/squadgazzz/luna-plugins/releases/download/latest/luna.filtered-queue-fix
```

Or install the full store:

```
https://github.com/squadgazzz/luna-plugins/releases/download/latest/store.json
```
