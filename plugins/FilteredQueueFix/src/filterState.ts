import type { LunaUnload } from "@luna/core";
import { observe } from "@luna/lib";

const FILTER_INPUT_SELECTOR = 'input[data-test="playlist-filter-input"]';

let filterInputElement: HTMLInputElement | null = null;

export function getCurrentFilterText(): string {
	if (filterInputElement !== null && filterInputElement.isConnected) {
		return filterInputElement.value;
	}
	return "";
}

export function hasActiveFilter(): boolean {
	return getCurrentFilterText().trim().length > 0;
}

export function setupFilterObserver(unloads: Set<LunaUnload>): void {
	observe<HTMLInputElement>(unloads, FILTER_INPUT_SELECTOR, (elem) => {
		filterInputElement = elem;
	});
}
