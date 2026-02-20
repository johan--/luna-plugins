import type { LunaUnload } from "@luna/core";
import type { redux } from "@luna/lib";
import { TidalApi } from "@luna/lib";

const cache = new Map<string, Set<redux.ItemId>>();
const pendingFetches = new Map<string, Promise<Set<redux.ItemId>>>();

export async function getPlaylistTrackIds(uuid: string): Promise<Set<redux.ItemId>> {
	const cached = cache.get(uuid);
	if (cached !== undefined) return cached;

	const pending = pendingFetches.get(uuid);
	if (pending !== undefined) return pending;

	const fetchPromise = (async () => {
		try {
			const result = await TidalApi.playlistItems(uuid);
			const ids = new Set<redux.ItemId>(result?.items.map((m) => m.item.id) ?? []);
			cache.set(uuid, ids);
			return ids;
		} finally {
			pendingFetches.delete(uuid);
		}
	})();

	pendingFetches.set(uuid, fetchPromise);
	return fetchPromise;
}

export function addToPlaylistCache(uuid: string, trackIds: redux.ItemId[]): void {
	const cached = cache.get(uuid);
	if (cached === undefined) return;
	for (const id of trackIds) cached.add(id);
}

export function clearCache(): void {
	cache.clear();
	pendingFetches.clear();
}

export function setupCache(unloads: Set<LunaUnload>): void {
	unloads.add(clearCache);
}
