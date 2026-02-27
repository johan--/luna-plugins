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
	let subscriberBlockedUntil = 0;
	let retryTimer: ReturnType<typeof setTimeout> | undefined;
	let scrollTimer: ReturnType<typeof setTimeout> | undefined;

	function processTrackChange(mediaItemId: string, fromMediaChanged: boolean): void {
		if (mediaItemId === lastProcessedId) return;
		lastProcessedId = mediaItemId;

		trace.log(`Track change: mediaItemId=${mediaItemId} source=${fromMediaChanged ? "MEDIA_CHANGED" : "subscriber"}`);

		// Immediately update track highlight
		setPlayingTrack(mediaItemId);

		// Clear any pending retry/scroll from previous track
		if (retryTimer !== undefined) clearTimeout(retryTimer);
		if (scrollTimer !== undefined) clearTimeout(scrollTimer);

		if (fromMediaChanged) {
			// Tidal Connect: queue data is stale. Retry source detection after delays.
			let attempt = 0;
			function retrySourceDetection(): void {
				attempt++;
				setPlayingTrack(mediaItemId);
				if (attempt < 4) {
					retryTimer = setTimeout(retrySourceDetection, 2000);
				}
			}
			retryTimer = setTimeout(retrySourceDetection, 2000);

			// Delay scroll to let queue stabilize (3s)
			if (autoScrollEnabled) {
				scrollTimer = setTimeout(() => scrollToPlayingTrack(), 3000);
			}
		} else {
			// Local playback / stable subscriber: scroll immediately
			if (autoScrollEnabled) {
				scrollTimer = setTimeout(() => scrollToPlayingTrack(), 300);
			}
		}
	}

	// Intercept Tidal Connect MEDIA_CHANGED
	redux.intercept("remotePlayback/tidalConnect/MEDIA_CHANGED", unloads, (payload) => {
		try {
			const mediaId = payload?.mediaId;
			if (mediaId === undefined || mediaId === null) return;

			trace.log(`MEDIA_CHANGED: mediaId=${mediaId}`);

			// Block subscriber for 5 seconds — queue data is unreliable
			subscriberBlockedUntil = Date.now() + 5000;

			processTrackChange(String(mediaId), true);
		} catch (err) {
			trace.err("Error in MEDIA_CHANGED handler:", err);
		}
	});

	// Store subscriber for local playback
	const unsubscribe = redux.store.subscribe(() => {
		try {
			if (Date.now() < subscriberBlockedUntil) return;

			const state = redux.store.getState();
			const newIndex = state.playQueue?.currentIndex;
			if (newIndex === undefined || newIndex < 0) return;

			const newElement = state.playQueue?.elements?.[newIndex];
			const newMediaItemId = newElement?.mediaItemId !== undefined ? String(newElement.mediaItemId) : undefined;
			if (newMediaItemId === undefined) return;

			processTrackChange(newMediaItemId, false);
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

	unloads.add(() => {
		if (retryTimer !== undefined) clearTimeout(retryTimer);
		if (scrollTimer !== undefined) clearTimeout(scrollTimer);
	});

	trace.log(`Connect sync ready. Initial mediaItemId=${lastProcessedId}`);
}
