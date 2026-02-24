import { Tracer } from "@luna/core";
import { redux } from "@luna/lib";

const { trace } = Tracer("[ScrollToPlaying]");

const TRACK_ROW_SELECTORS = [
	'[data-test="tracklist-row"]',
	'[data-test*="track-row"]',
	'[class*="trackRow"]',
	'[data-type="mediaItem"]',
];

function findTrackRows(): NodeListOf<Element> | null {
	for (const selector of TRACK_ROW_SELECTORS) {
		const rows = document.querySelectorAll(selector);
		if (rows.length > 0) return rows;
	}
	return null;
}

function findScrollContainer(element: Element): Element | null {
	let current = element.parentElement;
	while (current !== null) {
		const style = getComputedStyle(current);
		if (style.overflowY === "auto" || style.overflowY === "scroll") {
			return current;
		}
		current = current.parentElement;
	}
	return null;
}

function getVisualIndex(queueIndex: number): number {
	const state = redux.store.getState();
	const queue = state.playQueue;

	// If shuffle is off, queue order matches visual order
	if (queue.shuffled !== true) return queueIndex;

	// When shuffled, find the track's mediaItemId and look it up
	// in the source tracklist to get the visual (playlist) index
	const element = queue.elements?.[queueIndex];
	if (element === undefined) return queueIndex;

	const mediaItemId = element.mediaItemId;
	const sourceTrackListName = queue.sourceTrackListName;
	if (sourceTrackListName === undefined || mediaItemId === undefined) return queueIndex;

	const trackList = state.content?.trackLists?.[sourceTrackListName];
	if (trackList === undefined) return queueIndex;

	const items = trackList.sorted?.defaultSort?.items;
	if (items === undefined) return queueIndex;

	const visualIdx = items.indexOf(mediaItemId);
	return visualIdx !== -1 ? visualIdx : queueIndex;
}

function isViewingSourcePlaylist(): boolean {
	const state = redux.store.getState();
	const entityId = state.playQueue?.sourceEntityId;
	if (entityId === undefined || entityId === null) return false;

	const currentPath = state.router?.currentPath;
	if (currentPath === undefined || currentPath === null) return false;

	return currentPath.includes(String(entityId));
}

export function scrollToPlayingTrack(): void {
	if (!isViewingSourcePlaylist()) {
		trace.info("Not viewing source playlist, skipping scroll");
		return;
	}

	const state = redux.store.getState();
	const queueIndex = state.playQueue?.currentIndex;
	if (queueIndex === undefined || queueIndex === null || queueIndex < 0) {
		trace.info("No current track index");
		return;
	}

	const rows = findTrackRows();
	if (rows === null || rows.length === 0) {
		trace.warn("Could not find track rows in DOM. Tried selectors:", TRACK_ROW_SELECTORS.join(", "));
		return;
	}

	const firstRow = rows[0];
	const rowHeight = firstRow.getBoundingClientRect().height;
	if (rowHeight === 0) {
		trace.warn("Track row has zero height");
		return;
	}

	const container = findScrollContainer(firstRow);
	if (container === null) {
		trace.warn("Could not find scroll container");
		return;
	}

	const visualIndex = getVisualIndex(queueIndex);
	const containerHeight = container.clientHeight;
	const targetTop = visualIndex * rowHeight;
	const scrollTarget = targetTop - containerHeight / 2 + rowHeight / 2;

	container.scrollTo({
		top: Math.max(0, scrollTarget),
		behavior: "smooth",
	});

	trace.info(`Scrolled to track at visual index ${visualIndex} (queue index ${queueIndex})`);
}
