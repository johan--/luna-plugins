import { Tracer } from "@luna/core";
import { redux } from "@luna/lib";

import { getCurrentTrackId, getSourceId } from "./highlight";

const { trace } = Tracer("[ScrollToPlaying]");

/**
 * Brute-force find all scroll containers whose bounding rect overlaps with the viewport.
 */
function findAllViewportScrollContainers(): Element[] {
	const result: Element[] = [];
	const vh = window.innerHeight;
	const all = document.querySelectorAll("*");
	for (const el of all) {
		if (el.scrollHeight <= el.clientHeight + 50) continue;
		if (el.clientWidth < 200) continue;
		const rect = el.getBoundingClientRect();
		const overlapTop = Math.max(0, rect.top);
		const overlapBottom = Math.min(vh, rect.bottom);
		if (overlapBottom - overlapTop < 100) continue;
		result.push(el);
	}
	return result;
}

/**
 * Find the main playlist scroll container.
 */
function findMainScrollContainer(): Element | null {
	const main = document.querySelector("main");
	if (main !== null && main.scrollHeight > main.clientHeight + 50) {
		return main;
	}

	const containers = findAllViewportScrollContainers();
	if (containers.length === 0) return null;

	let best: Element | null = null;
	let bestScore = 0;

	for (const c of containers) {
		const trackLinks = c.querySelectorAll('a[href*="/track/"]').length;
		const score = trackLinks * 100000 + c.scrollHeight;
		if (score > bestScore) {
			best = c;
			bestScore = score;
		}
	}

	return best;
}

/**
 * Find the track's position in the current page's tracklist (from URL + state.content.trackLists).
 * This is independent of queue data — works even when queue is stale (Tidal Connect).
 * Supports /playlist/UUID, /album/UUID, /mix/UUID, and /my-collection/tracks.
 */
function getTrackPositionOnCurrentPage(trackId: string): { index: number; total: number } | null {
	const trackLists = redux.store.getState().content?.trackLists;
	if (!trackLists) return null;

	const numericId = Number(trackId);

	// If URL has a playlist/album/mix UUID, filter by it
	const urlMatch = window.location.href.match(/\/(playlist|album|mix)\/([a-f0-9-]+)/i);
	const pageId = urlMatch ? urlMatch[2] : undefined;

	// For /my-collection/tracks (no UUID), search all loaded trackLists
	const isCollectionPage = !pageId && /\/my-collection\/(tracks|albums)/i.test(window.location.href);
	if (!pageId && !isCollectionPage) return null;

	for (const key of Object.keys(trackLists)) {
		if (pageId && !key.includes(pageId)) continue;

		const tl = trackLists[key];
		if (!tl?.sorted) continue;

		// Check all sort orders (defaultSort, DATE_DESC, etc.)
		for (const sortKey of Object.keys(tl.sorted)) {
			const items = tl.sorted[sortKey]?.items;
			if (!items || items.length === 0) continue;

			let idx = items.indexOf(numericId);
			if (idx === -1) idx = items.indexOf(trackId as never);
			if (idx !== -1) {
				trace.log(`Track found in "${key}" sort="${sortKey}" at index=${idx}/${items.length}`);
				return { index: idx, total: items.length };
			}
		}
	}

	return null;
}

function getTrackCount(): number {
	const state = redux.store.getState();
	const trackListName = state.playQueue?.sourceTrackListName;

	if (trackListName) {
		const trackList = state.content?.trackLists?.[trackListName];
		if (trackList) {
			const count = trackList.sorted?.defaultSort?.items?.length ?? trackList.totalNumberOfItems ?? 0;
			if (count > 0) return count;
		}
	}

	const elements = state.playQueue?.elements;
	if (elements?.length > 0) {
		return elements.length;
	}

	return 0;
}

function getVisualIndex(queueIndex: number): number {
	const state = redux.store.getState();
	const queue = state.playQueue;
	if (!queue.shuffleModeEnabled) return queueIndex;

	const element = queue.elements?.[queueIndex];
	if (element === undefined) return queueIndex;

	const mediaItemId = element.mediaItemId;
	const sourceTrackListName = queue.sourceTrackListName;
	if (!sourceTrackListName || mediaItemId === undefined) return queueIndex;

	const trackList = state.content?.trackLists?.[sourceTrackListName];
	if (trackList === undefined) return queueIndex;

	const items = trackList.sorted?.defaultSort?.items;
	if (items === undefined) return queueIndex;

	const visualIdx = items.indexOf(mediaItemId);
	return visualIdx !== -1 ? visualIdx : queueIndex;
}

/**
 * Check if the user is currently viewing a page where the playing track should be visible.
 * Supports playlists, albums, mixes, and /my-collection/tracks.
 */
function isPlayingTrackOnCurrentPage(): boolean {
	const trackId = getCurrentTrackId();
	if (!trackId) return false;

	// If we know the source playlist, check if the URL contains that UUID
	const sourceId = getSourceId();
	if (sourceId) {
		return window.location.href.includes(sourceId);
	}

	// No source detected — check if we can find the track on this page
	return getTrackPositionOnCurrentPage(trackId) !== null;
}

export { findMainScrollContainer, findTrackLink, getTrackCount, getVisualIndex, isPlayingTrackOnCurrentPage };

/**
 * Find a track link in the main content area, ignoring links inside the queue panel.
 */
function findTrackLink(container: Element, trackId: string): Element | null {
	const links = container.querySelectorAll(`a[href*="/track/${trackId}"]`);
	for (const link of links) {
		let inQueue = false;
		let ancestor: Element | null = link.parentElement;
		while (ancestor && ancestor !== container) {
			const cls = ancestor.className?.toString?.() ?? "";
			if (/queue/i.test(cls)) {
				inQueue = true;
				break;
			}
			ancestor = ancestor.parentElement;
		}
		if (!inQueue) return link;
	}
	return null;
}

export function scrollToPlayingTrack(): void {
	const trackId = getCurrentTrackId();
	if (trackId === undefined) return;

	trace.log(`scrollToPlayingTrack: trackId=${trackId}`);

	const container = findMainScrollContainer();
	if (container === null) {
		trace.warn("No scroll container found");
		return;
	}

	const containerRect = container.getBoundingClientRect();

	// 1. Try to find the track link in the DOM (excluding queue panel)
	const link = findTrackLink(container, trackId);
	if (link !== null) {
		const linkRect = link.getBoundingClientRect();

		// If already visible, skip
		if (linkRect.top >= containerRect.top && linkRect.bottom <= containerRect.bottom) {
			trace.log("Track already visible, skipping scroll");
			return;
		}

		const offsetInContainer = linkRect.top - containerRect.top + container.scrollTop;
		const centeredPosition = offsetInContainer - container.clientHeight / 2 + linkRect.height / 2;
		container.scrollTo({ top: Math.max(0, centeredPosition), behavior: "smooth" });
		return;
	}

	// 2. Track not in DOM — use page tracklist data (reliable, not queue-dependent)
	const pagePosition = getTrackPositionOnCurrentPage(trackId);
	if (pagePosition !== null) {
		const estimatedPosition = (pagePosition.index / pagePosition.total) * container.scrollHeight;
		const centeredPosition = estimatedPosition - container.clientHeight / 2;

		trace.log(`Page-based estimation: index=${pagePosition.index}/${pagePosition.total} -> scrollTo=${Math.max(0, centeredPosition).toFixed(0)}`);
		container.scrollTo({ top: Math.max(0, centeredPosition), behavior: "smooth" });

		// Refine after virtualizer renders
		setTimeout(() => {
			const refinedLink = findTrackLink(container, trackId);
			if (refinedLink !== null) {
				const linkRect = refinedLink.getBoundingClientRect();
				const cRect = container.getBoundingClientRect();
				const offset = linkRect.top - cRect.top + container.scrollTop;
				const centered = offset - container.clientHeight / 2 + linkRect.height / 2;
				container.scrollTo({ top: Math.max(0, centered), behavior: "smooth" });
				trace.log("Refined scroll after estimation");
			}
		}, 600);
		return;
	}

	// 3. No reliable data — don't scroll to avoid going to wrong position
	trace.log("Track not in DOM and no page tracklist data, skipping scroll");
}
