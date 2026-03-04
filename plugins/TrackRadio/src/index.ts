import { trace, unloads } from "./index.safe";

import { ContextMenu, redux } from "@luna/lib";

export { errSignal, unloads } from "./index.safe";

const radioButton = ContextMenu.addButton(unloads);
radioButton.text = "Go to Track Radio";

ContextMenu.onMediaItem(unloads, async ({ mediaCollection, contextMenu }) => {
	const count = await mediaCollection.count();
	if (count !== 1) return;

	const items = await mediaCollection.mediaItems();
	let trackId: redux.ItemId | undefined;
	for await (const item of items) {
		trackId = item.id;
		break;
	}
	if (trackId === undefined) return;

	radioButton.onClick(async () => {
		radioButton.text = "Loading Track Radio...";
		try {
			const result = await redux.interceptActionResp(
				() => redux.actions["mix/LOAD_TRACK_MIX_ID"]({ id: trackId }),
				unloads,
				["mix/LOAD_TRACK_MIX_ID_SUCCESS"],
				["mix/LOAD_TRACK_MIX_ID_FAIL"],
			);
			// interceptActionResp resolves for both success AND fail actions — check for mixId
			if (!("mixId" in result) || !result.mixId) {
				const errorMsg = "error" in result ? result.error : "No radio available for this track";
				trace.msg.err(errorMsg);
				return;
			}
			redux.actions["router/PUSH"]({ pathname: `/mix/${result.mixId}`, search: "", replace: false });
		} catch (err) {
			trace.msg.err.withContext("Failed to load track radio")(err);
		} finally {
			radioButton.text = "Go to Track Radio";
		}
	});

	await radioButton.show(contextMenu);
});
