import type { LunaUnload } from "@luna/core";
import { Tracer } from "@luna/core";
import { redux } from "@luna/lib";

import { setPlayingTrack } from "./highlight";
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

export function setupConnectSync(unloads: Set<LunaUnload>): void {
	trace.log("Setting up connect sync...");

	// Approach 1: Intercept Tidal Connect MEDIA_CHANGED to dispatch SET_CURRENT_INDEX
	// Note: payload.itemId is a UUID, payload.mediaId is the numeric track ID matching queue elements
	redux.intercept("remotePlayback/tidalConnect/MEDIA_CHANGED", unloads, (payload) => {
		trace.log("MEDIA_CHANGED intercepted:", JSON.stringify(payload).substring(0, 200));

		const mediaId = payload?.mediaId;
		if (mediaId === undefined || mediaId === null) return;

		const index = findQueueIndexByItemId(String(mediaId));
		if (index !== -1) {
			trace.log(`Dispatching SET_CURRENT_INDEX(${index}) for mediaId ${mediaId}`);
			redux.actions["playQueue/SET_CURRENT_INDEX"](index);
		} else {
			trace.warn(`Could not find track mediaId=${mediaId} in play queue elements`);
		}
	});

	// Approach 2: store.subscribe to detect ANY track change (works for both local and remote)
	let prevIndex: number | undefined;
	let prevMediaItemId: string | undefined;

	const updateFromState = () => {
		const state = redux.store.getState();
		const newIndex = state.playQueue?.currentIndex;
		const newElement = newIndex !== undefined && newIndex >= 0 ? state.playQueue?.elements?.[newIndex] : undefined;
		const newMediaItemId = newElement?.mediaItemId !== undefined ? String(newElement.mediaItemId) : undefined;

		if (newMediaItemId !== undefined && newMediaItemId !== prevMediaItemId) {
			trace.log(`Track changed: index=${newIndex} mediaItemId=${newMediaItemId} (prev=${prevMediaItemId})`);
			prevIndex = newIndex;
			prevMediaItemId = newMediaItemId;

			setPlayingTrack(newMediaItemId);

			if (autoScrollEnabled) {
				setTimeout(() => scrollToPlayingTrack(newIndex), 300);
			}
		}
	};

	// Initialize tracking
	const state = redux.store.getState();
	prevIndex = state.playQueue?.currentIndex;
	const initElement = prevIndex !== undefined && prevIndex >= 0 ? state.playQueue?.elements?.[prevIndex] : undefined;
	prevMediaItemId = initElement?.mediaItemId !== undefined ? String(initElement.mediaItemId) : undefined;

	const unsubscribe = redux.store.subscribe(updateFromState);
	unloads.add(unsubscribe);

	trace.log(`Connect sync ready. Initial index=${prevIndex} mediaItemId=${prevMediaItemId}`);
}
