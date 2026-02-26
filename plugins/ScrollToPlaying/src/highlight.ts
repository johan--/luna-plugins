import type { LunaUnload } from "@luna/core";
import { Tracer } from "@luna/core";
import { redux } from "@luna/lib";

import { highlightColor, highlightOpacity } from "./state";

const { trace } = Tracer("[ScrollToPlaying]");

let highlightStyle: HTMLStyleElement | null = null;
let currentTrackId: string | undefined;

function buildHighlightCSS(trackId: string): string {
	const rgb = highlightColor;
	const opacity = highlightOpacity / 100;

	return `
/* Row highlight in main tracklist — exclude queue panel */
[role="row"]:has(a[href*="/track/${trackId}"]):not([class*="queue"]):not([class*="Queue"]) {
	background: rgba(${rgb}, ${opacity}) !important;
	box-shadow: inset 3px 0 0 rgb(${rgb}) !important;
}
[aria-rowindex]:has(a[href*="/track/${trackId}"]) {
	background: rgba(${rgb}, ${opacity}) !important;
	box-shadow: inset 3px 0 0 rgb(${rgb}) !important;
}
[data-track-id="${trackId}"] { background: rgba(${rgb}, ${opacity}) !important; }
[data-item-id="${trackId}"] { background: rgba(${rgb}, ${opacity}) !important; }

/* Color ALL text within the highlighted row — scoped to row, not global */
[role="row"]:has(a[href*="/track/${trackId}"]) a,
[role="row"]:has(a[href*="/track/${trackId}"]) span,
[role="row"]:has(a[href*="/track/${trackId}"]) div,
[role="row"]:has(a[href*="/track/${trackId}"]) p { color: rgb(${rgb}) !important; }

[aria-rowindex]:has(a[href*="/track/${trackId}"]) a,
[aria-rowindex]:has(a[href*="/track/${trackId}"]) span,
[aria-rowindex]:has(a[href*="/track/${trackId}"]) div,
[aria-rowindex]:has(a[href*="/track/${trackId}"]) p { color: rgb(${rgb}) !important; }
`;
}

export function getCurrentTrackId(): string | undefined {
	return currentTrackId;
}

/** Re-apply highlight CSS with current settings. */
export function refreshHighlight(): void {
	if (highlightStyle === null || currentTrackId === undefined) return;
	highlightStyle.textContent = buildHighlightCSS(currentTrackId);
}

export function setPlayingTrack(mediaItemId: string | number | undefined): void {
	currentTrackId = mediaItemId !== undefined ? String(mediaItemId) : undefined;
	if (highlightStyle === null) return;

	if (currentTrackId === undefined) {
		highlightStyle.textContent = "";
		return;
	}

	highlightStyle.textContent = buildHighlightCSS(currentTrackId);
	trace.log(`Highlight CSS injected for track ${currentTrackId}`);
}

export function setupHighlight(unloads: Set<LunaUnload>): void {
	highlightStyle = document.createElement("style");
	highlightStyle.id = "stp-now-playing-highlight";
	document.head.appendChild(highlightStyle);

	unloads.add(() => {
		highlightStyle?.remove();
		highlightStyle = null;
		currentTrackId = undefined;
	});

	// Initialize with current playing track
	const state = redux.store.getState();
	const idx = state.playQueue?.currentIndex;
	if (idx !== undefined && idx >= 0) {
		const element = state.playQueue?.elements?.[idx];
		if (element?.mediaItemId !== undefined) {
			setPlayingTrack(element.mediaItemId);
		}
	}

	trace.log("Highlight setup complete");
}
