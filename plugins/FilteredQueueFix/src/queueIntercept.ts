import type { LunaUnload } from "@luna/core";
import { PlayState, redux } from "@luna/lib";

import { filterTrackIds } from "./filterMatch";
import { getCurrentFilterText, hasActiveFilter } from "./filterState";

export function setupQueueIntercepts(unloads: Set<LunaUnload>): void {
	// Intercept: playing from a playlist tracklist (most common path)
	redux.intercept("playQueue/ADD_TRACK_LIST_TO_PLAY_QUEUE", unloads, (payload) => {
		if (payload.position !== "now") return;
		if (!hasActiveFilter()) return;

		const filterText = getCurrentFilterText();
		const state = redux.store.getState();
		const trackList = state.content.trackLists[payload.trackListName];
		if (trackList === undefined) return;

		const allItems = trackList.sorted.defaultSort.items;
		if (allItems.length === 0) return;

		const filteredIds = filterTrackIds(allItems, filterText, state);
		if (filteredIds.length === 0) return; // don't block if filter yields nothing

		// Find clicked track and map to new index in filtered list
		const clickedId = payload.fromIndex !== undefined ? allItems[payload.fromIndex] : undefined;
		let newFromIndex = 0;
		if (clickedId !== undefined) {
			const idx = filteredIds.indexOf(clickedId);
			if (idx !== -1) newFromIndex = idx;
		}

		const shuffleSeed = payload.forceShuffle || PlayState.shuffle ? Math.random() : undefined;

		// Dispatch filtered queue
		redux.actions["playQueue/ADD_NOW"]({
			context: payload.context,
			mediaItemIds: filteredIds,
			fromIndex: newFromIndex,
			overwritePlayQueue: true,
			shuffleSeed,
		});

		// Preserve "Playing from" UI label
		if (payload.entityType !== undefined || payload.sourceTitle !== undefined) {
			redux.actions["playQueue/SET_SOURCE_PROPERTIES"]({
				name: payload.sourceTitle ?? "",
				trackListName: payload.trackListName,
				dataApiPath: payload.dataApiPath,
				entityId: payload.entityId,
				entityItemsType: payload.entityItemsType,
				entityType: payload.entityType,
			});
		}

		return true; // block original action
	});

	// Intercept: lazy-loaded lists fetching first page
	redux.intercept("playQueue/FETCH_FIRST_PAGE_AND_ADD_TO_QUEUE", unloads, (payload) => {
		if (payload.position !== "now") return;
		if (!hasActiveFilter()) return;

		const filterText = getCurrentFilterText();
		const state = redux.store.getState();
		const trackList = state.content.trackLists[payload.trackListName];
		if (trackList === undefined) return;

		const allItems = trackList.sorted.defaultSort.items;
		if (allItems.length === 0) return; // nothing loaded yet, let original through

		const filteredIds = filterTrackIds(allItems, filterText, state);
		if (filteredIds.length === 0) return;

		const clickedId = payload.fromIndex !== undefined ? allItems[payload.fromIndex] : undefined;
		let newFromIndex = 0;
		if (clickedId !== undefined) {
			const idx = filteredIds.indexOf(clickedId);
			if (idx !== -1) newFromIndex = idx;
		}

		const shuffleSeed = payload.forceShuffle || PlayState.shuffle ? Math.random() : undefined;

		redux.actions["playQueue/ADD_NOW"]({
			context: payload.context,
			mediaItemIds: filteredIds,
			fromIndex: newFromIndex,
			overwritePlayQueue: true,
			shuffleSeed,
		});

		return true;
	});

	// Intercept: already-loaded items being added to queue
	redux.intercept("playQueue/ADD_ALREADY_LOADED_ITEMS_TO_QUEUE", unloads, (payload) => {
		if (payload.position !== "now") return;
		if (!hasActiveFilter()) return;

		const filterText = getCurrentFilterText();
		const state = redux.store.getState();

		const filteredIds = filterTrackIds(payload.items, filterText, state);
		if (filteredIds.length === 0) return;

		const clickedId = payload.fromIndex !== undefined ? payload.items[payload.fromIndex] : undefined;
		let newFromIndex = 0;
		if (clickedId !== undefined) {
			const idx = filteredIds.indexOf(clickedId);
			if (idx !== -1) newFromIndex = idx;
		}

		const shuffleSeed = payload.forceShuffle || PlayState.shuffle ? Math.random() : undefined;

		redux.actions["playQueue/ADD_NOW"]({
			context: payload.context,
			mediaItemIds: filteredIds,
			fromIndex: newFromIndex,
			overwritePlayQueue: true,
			shuffleSeed,
		});

		return true;
	});
}
