const STORAGE_PREFIX = "scrollToPlaying:";

export let autoScrollEnabled = localStorage.getItem(`${STORAGE_PREFIX}autoScroll`) !== "false";
export let highlightColor = localStorage.getItem(`${STORAGE_PREFIX}highlightColor`) ?? "126, 251, 238";
export let highlightOpacity = Number(localStorage.getItem(`${STORAGE_PREFIX}highlightOpacity`)) || 20;

export function setAutoScroll(enabled: boolean): void {
	autoScrollEnabled = enabled;
	localStorage.setItem(`${STORAGE_PREFIX}autoScroll`, String(enabled));
}

export function setHighlightColor(color: string): void {
	highlightColor = color;
	localStorage.setItem(`${STORAGE_PREFIX}highlightColor`, color);
}

export function setHighlightOpacity(opacity: number): void {
	highlightOpacity = Math.max(0, Math.min(100, opacity));
	localStorage.setItem(`${STORAGE_PREFIX}highlightOpacity`, String(highlightOpacity));
}
