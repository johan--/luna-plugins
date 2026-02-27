import type { LunaUnload } from "@luna/core";
import { Tracer } from "@luna/core";
import { redux } from "@luna/lib";

import { setPlayingTrack } from "./highlight";
import { scrollToPlayingTrack } from "./scrollToTrack";
import { autoScrollEnabled } from "./state";

const { trace } = Tracer("[ScrollToPlaying]");

export function setupConnectSync(unloads: Set<LunaUnload>): void {
	trace.log("Setting up connect sync...");

	let lastProcessedId: string | undefined;

	// MEDIA_CHANGED lock: completely blocks the store subscriber for a period
	// to prevent stale queue data from overriding the authoritative MEDIA_CHANGED track.
	let subscriberBlockedUntil = 0;

	// Debounced scroll: multiple rapid track changes only trigger one scroll
	let pendingScrollTimeout: ReturnType<typeof setTimeout> | undefined;

	function scheduleScroll(): void {
		if (pendingScrollTimeout !== undefined) clearTimeout(pendingScrollTimeout);
		pendingScrollTimeout = setTimeout(() => {
			pendingScrollTimeout = undefined;
			// Always read fresh state — don't use stale queue indices
			scrollToPlayingTrack();
		}, 500);
	}

	function processTrackChange(mediaItemId: string): void {
		if (mediaItemId === lastProcessedId) return;
		lastProcessedId = mediaItemId;

		trace.log(`Track change: mediaItemId=${mediaItemId}`);
		setPlayingTrack(mediaItemId);

		if (autoScrollEnabled) {
			scheduleScroll();
		}
	}

	// Intercept Tidal Connect MEDIA_CHANGED — authoritative source for remote playback
	redux.intercept("remotePlayback/tidalConnect/MEDIA_CHANGED", unloads, (payload) => {
		try {
			const mediaId = payload?.mediaId;
			if (mediaId === undefined || mediaId === null) return;

			trace.log(`MEDIA_CHANGED: mediaId=${mediaId}`);

			// Block subscriber completely for 3 seconds — queue data is unreliable during this period
			subscriberBlockedUntil = Date.now() + 3000;

			processTrackChange(String(mediaId));

			// Schedule a delayed re-highlight after queue stabilizes (for source playlist detection)
			setTimeout(() => {
				setPlayingTrack(String(mediaId));
			}, 3000);
		} catch (err) {
			trace.err("Error in MEDIA_CHANGED handler:", err);
		}
	});

	// Store subscriber for local playback and delayed queue updates
	const unsubscribe = redux.store.subscribe(() => {
		try {
			// Completely blocked during MEDIA_CHANGED cooldown
			if (Date.now() < subscriberBlockedUntil) return;

			const state = redux.store.getState();
			const newIndex = state.playQueue?.currentIndex;
			if (newIndex === undefined || newIndex < 0) return;

			const newElement = state.playQueue?.elements?.[newIndex];
			const newMediaItemId = newElement?.mediaItemId !== undefined ? String(newElement.mediaItemId) : undefined;
			if (newMediaItemId === undefined) return;

			processTrackChange(newMediaItemId);
		} catch (err) {
			trace.err("Error in store subscriber:", err);
		}
	});
	unloads.add(unsubscribe);

	// Initialize
	const state = redux.store.getState();
	const initIndex = state.playQueue?.currentIndex;
	const initElement = initIndex !== undefined && initIndex >= 0 ? state.playQueue?.elements?.[initIndex] : undefined;
	if (initElement?.mediaItemId !== undefined) {
		lastProcessedId = String(initElement.mediaItemId);
	}

	trace.log(`Connect sync ready. Initial mediaItemId=${lastProcessedId}`);
}
