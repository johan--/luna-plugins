import type { redux } from "@luna/lib";

export function filterTrackIds(trackIds: (string | number)[], filterText: string, state: redux.TidalStoreState): (string | number)[] {
	const lowerFilter = filterText.toLowerCase().trim();
	if (lowerFilter.length === 0) return trackIds;

	return trackIds.filter((id) => {
		const mediaEntry = state.content.mediaItems[id];
		if (mediaEntry === undefined) return true; // conservatively include unresolved items

		const item = mediaEntry.item;
		if (item.title?.toLowerCase().includes(lowerFilter)) return true;
		if (item.version?.toLowerCase().includes(lowerFilter)) return true;
		if (item.artist?.name?.toLowerCase().includes(lowerFilter)) return true;
		if (item.artists?.some((a) => a.name?.toLowerCase().includes(lowerFilter))) return true;
		if (item.album?.title?.toLowerCase().includes(lowerFilter)) return true;

		return false;
	});
}
