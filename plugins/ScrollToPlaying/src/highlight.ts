import type { LunaUnload } from "@luna/core";
import { Tracer } from "@luna/core";
import { redux } from "@luna/lib";

import { highlightColor, highlightOpacity } from "./state";

const { trace } = Tracer("[ScrollToPlaying]");

let highlightStyle: HTMLStyleElement | null = null;
let currentTrackId: string | undefined;
let sourcePlaylistId: string | undefined;

/**
 * Find the source playlist UUID by matching queue elements against loaded trackLists.
 */
function findSourcePlaylistId(): string | undefined {
	const state = redux.store.getState();
	const elements = state.playQueue?.elements;
	if (!elements || elements.length === 0) return undefined;

	const trackLists = state.content?.trackLists;
	if (!trackLists) return undefined;

	// Sample queue elements for matching
	const sampleIds: number[] = [];
	const step = Math.max(1, Math.floor(elements.length / 5));
	for (let i = 0; i < elements.length && sampleIds.length < 5; i += step) {
		const id = elements[i]?.mediaItemId;
		if (id !== undefined) sampleIds.push(Number(id));
	}

	let bestKey: string | undefined;
	let bestMatches = 0;

	for (const key of Object.keys(trackLists)) {
		const items = trackLists[key]?.sorted?.defaultSort?.items;
		if (!items || items.length < 2) continue;

		let matches = 0;
		for (const id of sampleIds) {
			if (items.includes(id)) matches++;
		}
		if (matches > bestMatches) {
			bestMatches = matches;
			bestKey = key;
		}
	}

	if (bestKey && bestMatches >= 2) {
		const match = bestKey.match(/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/i);
		return match ? match[1] : undefined;
	}

	return undefined;
}

function buildHighlightCSS(trackId: string): string {
	const rgb = highlightColor;
	const opacity = highlightOpacity / 100;

	let css = `
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

	// Highlight source playlist in sidebar
	if (sourcePlaylistId) {
		css += `
/* Source playlist highlight in sidebar */
a[href*="/playlist/${sourcePlaylistId}"],
a[href*="/album/${sourcePlaylistId}"] {
	color: rgb(${rgb}) !important;
}
a[href*="/playlist/${sourcePlaylistId}"] span,
a[href*="/album/${sourcePlaylistId}"] span {
	color: rgb(${rgb}) !important;
}
`;
	}

	return css;
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
		sourcePlaylistId = undefined;
		return;
	}

	// Detect source playlist if not already known
	if (!sourcePlaylistId) {
		sourcePlaylistId = findSourcePlaylistId();
		if (sourcePlaylistId) {
			trace.log(`Source playlist detected: ${sourcePlaylistId}`);
		}
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
