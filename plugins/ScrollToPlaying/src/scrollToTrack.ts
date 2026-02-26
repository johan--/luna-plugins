import { Tracer } from "@luna/core";
import { redux } from "@luna/lib";

import { getCurrentTrackId } from "./highlight";

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
		// Container must be at least partially in the viewport
		const overlapTop = Math.max(0, rect.top);
		const overlapBottom = Math.min(vh, rect.bottom);
		if (overlapBottom - overlapTop < 100) continue;
		result.push(el);
	}
	return result;
}

/**
 * Find the main playlist scroll container.
 * Prefer the <main> element; fall back to brute-force search.
 */
function findMainScrollContainer(): Element | null {
	// Direct approach: the <main> element is the scroll container in Tidal
	const main = document.querySelector("main");
	if (main !== null && main.scrollHeight > main.clientHeight + 50) {
		return main;
	}

	// Fallback: brute-force search
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

	// Fallback: use the queue elements count
	const elements = state.playQueue?.elements;
	if (elements?.length > 0) {
		trace.log(`Using queue elements length as track count: ${elements.length}`);
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

export { findMainScrollContainer, getTrackCount, getVisualIndex };

export function scrollToPlayingTrack(targetQueueIndex?: number): void {
	const trackId = getCurrentTrackId();
	trace.log(`scrollToPlayingTrack: targetIndex=${targetQueueIndex} trackId=${trackId}`);

	const container = findMainScrollContainer();
	if (container === null) {
		trace.warn("No scroll container found in viewport");
		return;
	}

	const containerRect = container.getBoundingClientRect();
	const containerStyle = getComputedStyle(container);
	trace.log(
		`Using container: <${container.tagName.toLowerCase()} class="${container.className.toString().substring(0, 50)}"> ` +
		`rect=[${containerRect.top.toFixed(0)},${containerRect.bottom.toFixed(0)}] scrollTop=${container.scrollTop} ` +
		`scrollH=${container.scrollHeight} clientH=${container.clientHeight} overflow=${containerStyle.overflowY}`,
	);

	// Check if the playing track link is inside this container
	if (trackId !== undefined) {
		const link = container.querySelector(`a[href*="/track/${trackId}"]`);
		if (link !== null) {
			const linkRect = link.getBoundingClientRect();
			const offsetInContainer = linkRect.top - containerRect.top + container.scrollTop;
			const centeredPosition = offsetInContainer - container.clientHeight / 2 + linkRect.height / 2;

			trace.log(`Track link found in container at top=${linkRect.top.toFixed(0)}, scrolling to ${centeredPosition.toFixed(0)}`);
			container.scrollTo({ top: Math.max(0, centeredPosition), behavior: "smooth" });
			return;
		}
	}

	// Track not in DOM (virtualized) — estimate position
	const state = redux.store.getState();
	const queueIndex = targetQueueIndex ?? state.playQueue?.currentIndex;
	if (queueIndex === undefined || queueIndex < 0) {
		trace.warn("No target track index for scroll");
		return;
	}

	const totalTracks = getTrackCount();
	if (totalTracks <= 0) {
		trace.warn(`Could not determine track count`);
		return;
	}

	const visualIndex = getVisualIndex(queueIndex);
	const estimatedPosition = (visualIndex / totalTracks) * container.scrollHeight;
	const centeredPosition = estimatedPosition - container.clientHeight / 2;

	trace.log(
		`Position estimation: visualIndex=${visualIndex}/${totalTracks} -> scrollTo=${Math.max(0, centeredPosition).toFixed(0)}`,
	);

	container.scrollTo({ top: Math.max(0, centeredPosition), behavior: "smooth" });

	// After scroll, refine if track is now in the DOM
	if (trackId !== undefined) {
		setTimeout(() => {
			const link = container.querySelector(`a[href*="/track/${trackId}"]`);
			if (link !== null) {
				const linkRect = link.getBoundingClientRect();
				const cRect = container.getBoundingClientRect();
				const offset = linkRect.top - cRect.top + container.scrollTop;
				const centered = offset - container.clientHeight / 2 + linkRect.height / 2;
				container.scrollTo({ top: Math.max(0, centered), behavior: "smooth" });
				trace.log("Refined scroll after estimation");
			} else {
				trace.log("Track still not in DOM after estimation scroll");
			}
		}, 600);
	}
}
