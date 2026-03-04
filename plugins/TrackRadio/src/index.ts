import { trace, unloads } from "./index.safe";

import { ContextMenu, redux } from "@luna/lib";

export { errSignal, unloads } from "./index.safe";

ContextMenu.onMediaItem(unloads, async ({ mediaCollection, contextMenu }) => {
	const count = await mediaCollection.count();
	if (count !== 1) return;

	// Find the native radio button — only act if it's disabled
	const nativeRadioLink = contextMenu.querySelector<HTMLAnchorElement>(`a[data-test="track-radio"]`);
	if (!nativeRadioLink || !Array.from(nativeRadioLink.classList).some((c) => c.startsWith("_disabled_"))) return;

	const nativeItem = nativeRadioLink.closest<HTMLElement>(`[data-type="contextmenu-item"]`);
	if (!nativeItem) return;

	const items = await mediaCollection.mediaItems();
	let trackId: redux.ItemId | undefined;
	for await (const item of items) {
		trackId = item.id;
		break;
	}
	if (trackId === undefined) return;

	// Remove disabled styling from the native button
	for (const cls of Array.from(nativeItem.classList)) {
		if (cls.startsWith("_actionItemDisabled_")) nativeItem.classList.remove(cls);
	}
	for (const cls of Array.from(nativeRadioLink.classList)) {
		if (cls.startsWith("_disabled_")) nativeRadioLink.classList.remove(cls);
	}

	const label = nativeRadioLink.querySelector("span");
	const originalText = label?.textContent ?? "";

	// Hijack click to force-fetch the radio
	nativeRadioLink.addEventListener("click", async (e) => {
		e.preventDefault();
		e.stopPropagation();
		if (label) label.textContent = "Loading Track Radio...";
		try {
			const result = await redux.interceptActionResp(
				() => redux.actions["mix/LOAD_TRACK_MIX_ID"]({ id: trackId }),
				unloads,
				["mix/LOAD_TRACK_MIX_ID_SUCCESS"],
				["mix/LOAD_TRACK_MIX_ID_FAIL"],
			);
			if (!("mixId" in result) || !result.mixId) {
				const errorMsg = "error" in result ? result.error : "No radio available for this track";
				trace.msg.err(errorMsg);
				return;
			}
			redux.actions["router/PUSH"]({ pathname: `/mix/${result.mixId}`, search: "", replace: false });
		} catch (err) {
			trace.msg.err.withContext("Failed to load track radio")(err);
		} finally {
			if (label) label.textContent = originalText;
		}
	});
});
