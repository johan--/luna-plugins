import type { LunaUnload } from "@luna/core";
import { observe, redux } from "@luna/lib";

import { addToPlaylistCache, getPlaylistTrackIds } from "./playlistCache";

let currentTrackId: redux.ItemId | null = null;

const PLAYLIST_ROW_SELECTOR = 'div[data-track--playlist-uuid][data-tracktype--playlist-uuid="string"]';
const INDICATOR_CLASS = "playlist-indicator-check";

function injectIndicator(row: Element): void {
	if (row.querySelector(`.${INDICATOR_CLASS}`) !== null) return;

	const textSpan = row.querySelector<HTMLSpanElement>('span[class*="_actionTextInner"]');
	if (textSpan === null) return;

	const indicator = document.createElement("span");
	indicator.className = INDICATOR_CLASS;
	indicator.textContent = "✓";
	textSpan.appendChild(indicator);
}

export function setupContextMenuHandler(unloads: Set<LunaUnload>): void {
	// Capture target track ID when "Add to playlist" menu opens (via "+" button)
	redux.intercept("contextMenu/OPEN", unloads, (payload) => {
		if (payload.type === "ADD_TO") {
			currentTrackId = payload.id;
		}
	});

	// Capture target track ID from the three-dots context menu
	redux.intercept("contextMenu/OPEN_MEDIA_ITEM", unloads, (payload) => {
		currentTrackId = payload.id;
	});

	// Clear track ID when context menu closes
	redux.intercept("contextMenu/CLOSE", unloads, () => {
		currentTrackId = null;
	});

	// Observe playlist rows as they appear in the DOM
	observe<HTMLDivElement>(unloads, PLAYLIST_ROW_SELECTOR, async (row) => {
		const trackId = currentTrackId;
		if (trackId === null) return;

		const uuid = row.getAttribute("data-track--playlist-uuid");
		if (uuid === null) return;

		const trackIds = await getPlaylistTrackIds(uuid);
		// Verify context hasn't changed while we were fetching
		if (currentTrackId !== trackId) return;
		if (trackIds.has(trackId)) {
			injectIndicator(row);
		}
	});

	// Optimistically update cache when a track is added to a playlist
	redux.intercept("content/ADD_MEDIA_ITEMS_TO_PLAYLIST_SUCCESS", unloads, (payload) => {
		addToPlaylistCache(String(payload.playlistUUID), payload.mediaItemIdsToAdd);
	});
}
