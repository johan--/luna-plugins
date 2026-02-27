import type { LunaUnload } from "@luna/core";
import { Tracer } from "@luna/core";
import { redux } from "@luna/lib";

import { getCurrentTrackId } from "./highlight";
import { findMainScrollContainer, findTrackLink, getTrackCount, getVisualIndex, isPlayingTrackOnCurrentPage, scrollToPlayingTrack } from "./scrollToTrack";

const { trace } = Tracer("[ScrollToPlaying]");

const ARROW_UP = "\u2191";
const ARROW_DOWN = "\u2193";

function getPlayingTrackScrollPosition(container: Element): number | null {
	const state = redux.store.getState();
	const queueIndex = state.playQueue?.currentIndex;
	if (queueIndex === undefined || queueIndex < 0) return null;

	const totalTracks = getTrackCount();
	if (totalTracks <= 0) return null;

	const visualIndex = getVisualIndex(queueIndex);
	return (visualIndex / totalTracks) * container.scrollHeight;
}

function getTrackVisibility(container: Element): "above" | "below" | "visible" {
	if (!isPlayingTrackOnCurrentPage()) return "visible";

	const trackId = getCurrentTrackId();
	if (trackId !== undefined) {
		const link = findTrackLink(container, trackId);
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
	if (estimatedPos === null) return "visible";

	const viewTop = container.scrollTop;
	const viewBottom = container.scrollTop + container.clientHeight;
	const margin = 50;

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
		try {
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
		} catch (err) {
			trace.err("Error updating button visibility:", err);
		}
	}

	let scrollListenerAttached = false;
	let scrollContainer: Element | null = null;

	function attachScrollListener(): void {
		const container = findMainScrollContainer();
		if (container === null || container === scrollContainer) return;

		if (scrollContainer !== null) {
			scrollContainer.removeEventListener("scroll", onScroll);
		}

		scrollContainer = container;
		scrollContainer.addEventListener("scroll", onScroll, { passive: true });
		scrollListenerAttached = true;

		updateButtonVisibility();
	}

	let scrollTimeout: ReturnType<typeof setTimeout> | undefined;
	function onScroll(): void {
		if (scrollTimeout !== undefined) return;
		scrollTimeout = setTimeout(() => {
			scrollTimeout = undefined;
			updateButtonVisibility();
		}, 100);
	}

	const initTimeout = setTimeout(() => attachScrollListener(), 500);

	let prevMediaItemId: string | undefined;
	const unsubscribe = redux.store.subscribe(() => {
		try {
			const state = redux.store.getState();
			const idx = state.playQueue?.currentIndex;
			const el = idx !== undefined && idx >= 0 ? state.playQueue?.elements?.[idx] : undefined;
			const mediaItemId = el?.mediaItemId !== undefined ? String(el.mediaItemId) : undefined;

			if (mediaItemId !== prevMediaItemId) {
				prevMediaItemId = mediaItemId;
				if (!scrollListenerAttached) attachScrollListener();
				updateButtonVisibility();
			}
		} catch (err) {
			trace.err("Error in scrollButton subscriber:", err);
		}
	});

	let prevHref = window.location.href;
	const navInterval = setInterval(() => {
		if (window.location.href !== prevHref) {
			prevHref = window.location.href;
			attachScrollListener();
			updateButtonVisibility();
		}
	}, 500);

	trace.log("Smart scroll button initialized");

	unloads.add(() => {
		button.remove();
		if (scrollContainer !== null) {
			scrollContainer.removeEventListener("scroll", onScroll);
		}
		if (scrollTimeout !== undefined) clearTimeout(scrollTimeout);
		clearTimeout(initTimeout);
		clearInterval(navInterval);
		unsubscribe();
	});
}
