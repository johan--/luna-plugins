import { Tracer } from "@luna/core";
import { redux } from "@luna/lib";

const { trace } = Tracer("[ScrollToPlaying]");

export function runDiagnostics(): void {
	trace.warn("=== ScrollToPlaying Diagnostics ===");

	const state = redux.store.getState();

	// PlayQueue state
	trace.warn(
		"playQueue:",
		JSON.stringify({
			currentIndex: state.playQueue?.currentIndex,
			elementsCount: state.playQueue?.elements?.length,
			sourceEntityId: state.playQueue?.sourceEntityId,
			sourceTrackListName: state.playQueue?.sourceTrackListName,
			shuffleModeEnabled: state.playQueue?.shuffleModeEnabled,
		}),
	);

	// Current track
	const idx = state.playQueue?.currentIndex;
	if (idx !== undefined && idx >= 0) {
		const element = state.playQueue?.elements?.[idx];
		trace.warn("Current queue element:", JSON.stringify(element));
		if (element?.mediaItemId !== undefined) {
			const mediaItem = (state.content as Record<string, unknown>)?.mediaItems;
			if (mediaItem && typeof mediaItem === "object") {
				trace.warn("Media item keys sample:", Object.keys(mediaItem as object).slice(0, 5).join(", "));
			}
		}
	}

	// Router
	trace.warn("router.currentPath:", state.router?.currentPath);

	// Track links in DOM
	const trackLinks = document.querySelectorAll('a[href*="/track/"]');
	trace.warn(`Links with /track/ in href: ${trackLinks.length}`);
	for (let i = 0; i < Math.min(3, trackLinks.length); i++) {
		const link = trackLinks[i];
		trace.warn(`  [${i}] href="${link.getAttribute("href")}" text="${link.textContent?.substring(0, 40)}"`);
	}

	// Unique data-test values
	const testEls = document.querySelectorAll("[data-test]");
	const uniqueTests = new Set<string>();
	testEls.forEach((el) => uniqueTests.add(el.getAttribute("data-test") ?? ""));
	trace.warn("data-test values:", [...uniqueTests].slice(0, 20).join(", "));

	// Potential track row selectors
	const rowSelectors = [
		'[role="row"]',
		"[aria-rowindex]",
		'[data-test*="track"]',
		'[data-test*="row"]',
		'[data-test*="list-item"]',
		'[data-type*="track"]',
		'[data-type*="media"]',
	];
	for (const sel of rowSelectors) {
		const els = document.querySelectorAll(sel);
		if (els.length > 0) {
			const first = els[0];
			trace.warn(
				`"${sel}": ${els.length} elements. First: <${first.tagName.toLowerCase()} class="${first.className.toString().substring(0, 60)}" data-test="${first.getAttribute("data-test")}">`,
			);
			// Log first element's outer HTML snippet
			trace.warn(`  HTML: ${first.outerHTML.substring(0, 300)}`);
		}
	}

	// Scrollable containers
	const scrollables: string[] = [];
	document.querySelectorAll("div, main, section").forEach((el) => {
		const style = getComputedStyle(el);
		if (
			(style.overflowY === "auto" || style.overflowY === "scroll") &&
			el.scrollHeight > el.clientHeight + 50
		) {
			const tag = el.tagName.toLowerCase();
			const cls = el.className.toString().substring(0, 40);
			scrollables.push(`<${tag} class="${cls}"> scroll=${el.scrollHeight} client=${el.clientHeight}`);
		}
	});
	trace.warn(`Scrollable containers (${scrollables.length}):`);
	scrollables.forEach((s) => trace.warn(`  ${s}`));

	// RemotePlayback state
	const remotePlayback = (state as Record<string, unknown>).remotePlayback;
	if (remotePlayback !== undefined) {
		trace.warn("remotePlayback:", JSON.stringify(remotePlayback).substring(0, 500));
	}

	trace.warn("=== End Diagnostics ===");
}
