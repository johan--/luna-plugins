import type { LunaUnload } from "@luna/core";
import { Tracer } from "@luna/core";
import { redux } from "@luna/lib";

import { getCurrentTrackId } from "./highlight";
import { findMainScrollContainer, getTrackCount, getVisualIndex, scrollToPlayingTrack } from "./scrollToTrack";

const { trace } = Tracer("[ScrollToPlaying]");

const ARROW_UP = "\u2191";
const ARROW_DOWN = "\u2193";

/**
 * Estimate the scroll position of the currently playing track within the container.
 * Returns null if we can't determine it.
 */
function getPlayingTrackScrollPosition(container: Element): number | null {
	const state = redux.store.getState();
	const queueIndex = state.playQueue?.currentIndex;
	if (queueIndex === undefined || queueIndex < 0) return null;

	const totalTracks = getTrackCount();
	if (totalTracks <= 0) return null;

	const visualIndex = getVisualIndex(queueIndex);
	return (visualIndex / totalTracks) * container.scrollHeight;
}

/**
 * Check if the playing track is visible in the container.
 * Returns "above" | "below" | "visible".
 */
function getTrackVisibility(container: Element): "above" | "below" | "visible" {
	// First check if the track link is actually in the DOM and visible
	const trackId = getCurrentTrackId();
	if (trackId !== undefined) {
		const link = container.querySelector(`a[href*="/track/${trackId}"]`);
		if (link !== null) {
			const containerRect = container.getBoundingClientRect();
			const linkRect = link.getBoundingClientRect();
			if (linkRect.bottom < containerRect.top) return "above";
			if (linkRect.top > containerRect.bottom) return "below";
			return "visible";
		}
	}

	// Track not in DOM (virtualized) — estimate from position
	const estimatedPos = getPlayingTrackScrollPosition(container);
	if (estimatedPos === null) return "visible"; // Can't determine, hide button

	const viewTop = container.scrollTop;
	const viewBottom = container.scrollTop + container.clientHeight;
	const margin = 50; // Small margin to avoid flickering at edges

	if (estimatedPos < viewTop - margin) return "above";
	if (estimatedPos > viewBottom + margin) return "below";
	return "visible";
}

export function setupScrollButton(unloads: Set<LunaUnload>): void {
	const button = document.createElement("button");
	button.className = "scroll-to-playing-btn";
	button.title = "Scroll to playing track";

	Object.assign(button.style, {
		position: "fixed",
		bottom: "100px",
		right: "20px",
		zIndex: "2147483647",
		width: "40px",
		height: "40px",
		borderRadius: "50%",
		border: "none",
		background: "rgba(255, 255, 255, 0.15)",
		color: "#fff",
		fontSize: "20px",
		cursor: "pointer",
		display: "none",
		alignItems: "center",
		justifyContent: "center",
		transition: "opacity 0.2s",
	});

	button.addEventListener("click", () => scrollToPlayingTrack());
	button.addEventListener("mouseenter", () => { button.style.background = "rgba(255, 255, 255, 0.3)"; });
	button.addEventListener("mouseleave", () => { button.style.background = "rgba(255, 255, 255, 0.15)"; });
	document.body.appendChild(button);

	let currentDirection: "above" | "below" | "visible" = "visible";

	function updateButtonVisibility(): void {
		const container = findMainScrollContainer();
		if (container === null) {
			button.style.display = "none";
			return;
		}

		const visibility = getTrackVisibility(container);

		if (visibility === "visible") {
			if (currentDirection !== "visible") {
				button.style.display = "none";
				currentDirection = "visible";
			}
			return;
		}

		button.textContent = visibility === "above" ? ARROW_UP : ARROW_DOWN;
		button.title = visibility === "above" ? "Scroll up to playing track" : "Scroll down to playing track";

		if (currentDirection === "visible") {
			button.style.display = "flex";
		}
		currentDirection = visibility;
	}

	// Listen to scroll events on <main>
	let scrollListenerAttached = false;
	let scrollContainer: Element | null = null;

	function attachScrollListener(): void {
		const container = findMainScrollContainer();
		if (container === null || container === scrollContainer) return;

		// Remove old listener
		if (scrollContainer !== null) {
			scrollContainer.removeEventListener("scroll", onScroll);
		}

		scrollContainer = container;
		scrollContainer.addEventListener("scroll", onScroll, { passive: true });
		scrollListenerAttached = true;

		// Initial check
		updateButtonVisibility();
	}

	let scrollTimeout: ReturnType<typeof setTimeout> | undefined;
	function onScroll(): void {
		// Throttle updates
		if (scrollTimeout !== undefined) return;
		scrollTimeout = setTimeout(() => {
			scrollTimeout = undefined;
			updateButtonVisibility();
		}, 100);
	}

	// Attach listener after a short delay (DOM needs to be ready)
	const initTimeout = setTimeout(() => attachScrollListener(), 500);

	// Also re-attach when track changes (store subscription)
	const unsubscribe = redux.store.subscribe(() => {
		if (!scrollListenerAttached) attachScrollListener();
		updateButtonVisibility();
	});

	trace.log("Smart scroll button initialized");

	unloads.add(() => {
		button.removeEventListener("click", () => scrollToPlayingTrack());
		button.remove();
		if (scrollContainer !== null) {
			scrollContainer.removeEventListener("scroll", onScroll);
		}
		if (scrollTimeout !== undefined) clearTimeout(scrollTimeout);
		clearTimeout(initTimeout);
		unsubscribe();
	});
}
