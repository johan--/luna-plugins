const STORAGE_KEY = "scrollToPlaying:autoScroll";

export let autoScrollEnabled = localStorage.getItem(STORAGE_KEY) !== "false";

export function setAutoScroll(enabled: boolean): void {
	autoScrollEnabled = enabled;
	localStorage.setItem(STORAGE_KEY, String(enabled));
}
