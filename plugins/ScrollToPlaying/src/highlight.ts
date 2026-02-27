import type { LunaUnload } from "@luna/core";
import { Tracer } from "@luna/core";
import { redux } from "@luna/lib";

import { highlightColor, highlightOpacity } from "./state";

const { trace } = Tracer("[ScrollToPlaying]");

let highlightStyle: HTMLStyleElement | null = null;
let currentTrackId: string | undefined;
let sourcePlaylistId: string | undefined;

/**
 * Detect the source playlist UUID.
 * 1. Local playback: read sourceEntityId directly
 * 2. Tidal Connect: sourceEntityId is empty — match queue elements against loaded trackLists
 */
function getSourcePlaylistId(): string | undefined {
	const state = redux.store.getState();
	const queue = state.playQueue;

	// 1. Local playback: sourceEntityId contains the playlist UUID
	const sourceEntityId = queue?.sourceEntityId;
	if (sourceEntityId) {
		const uuidMatch = String(sourceEntityId).match(/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/i);
		if (uuidMatch) return uuidMatch[1];
		return String(sourceEntityId);
	}

	// 2. Try sourceTrackListName
	const sourceTrackListName = queue?.sourceTrackListName;
	if (sourceTrackListName) {
		const match = sourceTrackListName.match(/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/i);
		if (match) return match[1];
	}

	// 3. Tidal Connect fallback: match queue elements against loaded trackLists
	if (!currentTrackId) return undefined;
	const trackLists = state.content?.trackLists;
	if (!trackLists) return undefined;

	const numericTrackId = Number(currentTrackId);
	const elements = queue?.elements;
	const sampleIds: number[] = [];
	if (elements && elements.length > 0) {
		const sampleCount = Math.min(10, elements.length);
		const step = Math.max(1, Math.floor(elements.length / sampleCount));
		for (let i = 0; i < elements.length && sampleIds.length < sampleCount; i += step) {
			const id = elements[i]?.mediaItemId;
			if (id !== undefined) sampleIds.push(Number(id));
		}
	}

	let bestKey: string | undefined;
	let bestQueueMatches = 0;

	for (const key of Object.keys(trackLists)) {
		const items = trackLists[key]?.sorted?.defaultSort?.items;
		if (!items || items.length < 2) continue;

		// Must contain the currently playing track
		if (!items.includes(numericTrackId) && !items.includes(currentTrackId as never)) continue;

		let queueMatches = 0;
		for (const id of sampleIds) {
			if (items.includes(id)) queueMatches++;
		}
		if (queueMatches > bestQueueMatches) {
			bestQueueMatches = queueMatches;
			bestKey = key;
		}
	}

	// Require at least 50% queue match to be confident
	const minMatches = Math.max(2, Math.ceil(sampleIds.length * 0.5));
	if (bestKey && bestQueueMatches >= minMatches) {
		trace.log(`Queue matching: ${bestQueueMatches}/${sampleIds.length} matches for key=${bestKey}`);
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

	// Always re-check source playlist (it changes when user plays from a different playlist)
	const newSourceId = getSourcePlaylistId();
	if (newSourceId !== sourcePlaylistId) {
		sourcePlaylistId = newSourceId;
		trace.log(newSourceId ? `Source playlist: ${newSourceId}` : "Source playlist cleared");
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
