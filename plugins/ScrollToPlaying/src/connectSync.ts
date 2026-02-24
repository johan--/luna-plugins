import type { LunaUnload } from "@luna/core";
import { Tracer } from "@luna/core";
import { redux } from "@luna/lib";

import { scrollToPlayingTrack } from "./scrollToTrack";
import { autoScrollEnabled } from "./state";

const { trace } = Tracer("[ScrollToPlaying]");

function findQueueIndexByItemId(itemId: string): number {
	const state = redux.store.getState();
	const elements = state.playQueue?.elements;
	if (elements === undefined) return -1;

	for (let i = 0; i < elements.length; i++) {
		if (String(elements[i].mediaItemId) === itemId) return i;
	}
	return -1;
}

function scheduleScroll(): void {
	if (!autoScrollEnabled) return;
	// Delay to let the UI update after index change
	setTimeout(scrollToPlayingTrack, 300);
}

export function setupConnectSync(unloads: Set<LunaUnload>): void {
	// Intercept Tidal Connect media changes to sync the queue index
	redux.intercept("remotePlayback/tidalConnect/MEDIA_CHANGED", unloads, (payload) => {
		const itemId = payload?.itemId;
		if (itemId === undefined || itemId === null) return;

		const index = findQueueIndexByItemId(String(itemId));
		if (index === -1) {
			trace.warn(`Could not find track ${itemId} in play queue`);
			return;
		}

		const state = redux.store.getState();
		if (state.playQueue?.currentIndex === index) return;

		trace.info(`Tidal Connect: syncing currentIndex to ${index} for itemId ${itemId}`);
		redux.actions["playQueue/SET_CURRENT_INDEX"](index);

		scheduleScroll();
	});

	// Auto-scroll on local playback track transitions
	redux.intercept("playbackControls/MEDIA_PRODUCT_TRANSITION", unloads, () => {
		scheduleScroll();
	});
}
