import { redux, TidalApi } from "@luna/lib";

import type { TrackItem } from "./detection";

interface PlaylistItemsResponse {
	items: TrackItem[];
	totalNumberOfItems: number;
}

export interface PlaylistInfo {
	uuid: string;
	title: string;
	numberOfTracks: number;
}

function getUserId(): number | null {
	const state = redux.store.getState();
	return state.session?.userId ?? null;
}

export async function fetchFavoritesCount(): Promise<number> {
	const userId = getUserId();
	if (userId === null) return 0;

	const headers = await TidalApi.getAuthHeaders();
	const queryArgs = TidalApi.queryArgs();
	const res = await fetch(`https://desktop.tidal.com/v1/users/${userId}/favorites/tracks?${queryArgs}&limit=1`, { headers });
	if (!res.ok) return 0;
	const data = (await res.json()) as { totalNumberOfItems: number; items: unknown[] };
	// Tidal's totalNumberOfItems can be stale after bulk deletion — if no items returned, count is 0
	if ((data.items ?? []).length === 0) return 0;
	return data.totalNumberOfItems ?? 0;
}

export async function fetchUserPlaylists(): Promise<PlaylistInfo[]> {
	const userId = getUserId();
	if (userId === null) throw new Error("Not logged in");

	const headers = await TidalApi.getAuthHeaders();
	const queryArgs = TidalApi.queryArgs();
	const res = await fetch(`https://desktop.tidal.com/v1/users/${userId}/playlists?${queryArgs}&limit=999`, { headers });
	if (!res.ok) throw new Error(`Failed to fetch playlists: ${res.status}`);

	const data = (await res.json()) as { items: { uuid: string; title: string; numberOfTracks: number }[] };
	return data.items.map((p) => ({ uuid: p.uuid, title: p.title, numberOfTracks: p.numberOfTracks }));
}

export async function fetchPlaylistItems(playlistUUID: string): Promise<TrackItem[]> {
	// Use raw fetch instead of TidalApi.playlistItems() to bypass memoization
	const headers = await TidalApi.getAuthHeaders();
	const queryArgs = TidalApi.queryArgs();
	const res = await fetch(`https://desktop.tidal.com/v1/playlists/${playlistUUID}/items?${queryArgs}&limit=-1`, { headers });
	if (!res.ok) throw new Error(`Failed to fetch playlist items: ${res.status}`);
	const data = (await res.json()) as PlaylistItemsResponse;
	return data.items;
}

export async function fetchFavoriteTracks(): Promise<TrackItem[]> {
	const userId = getUserId();
	if (userId === null) throw new Error("Not logged in");

	const headers = await TidalApi.getAuthHeaders();
	const queryArgs = TidalApi.queryArgs();
	const items: TrackItem[] = [];
	const seenIds = new Set<number>();
	let offset = 0;
	const limit = 9999;
	let total = Infinity;

	while (offset < total) {
		const res = await fetch(
			`https://desktop.tidal.com/v1/users/${userId}/favorites/tracks?${queryArgs}&limit=${limit}&offset=${offset}&order=DATE&orderDirection=ASC`,
			{ headers },
		);
		if (!res.ok) throw new Error(`Failed to fetch favorites: ${res.status}`);
		const data = (await res.json()) as PlaylistItemsResponse & { totalNumberOfItems?: number };
		if (data.totalNumberOfItems !== undefined) total = data.totalNumberOfItems;
		const page = data.items ?? [];
		if (page.length === 0) break;
		for (const item of page) {
			if (!seenIds.has(item.item.id)) {
				seenIds.add(item.item.id);
				items.push(item);
			}
		}
		offset += page.length;
	}

	return items;
}

export async function removeFromPlaylist(playlistUUID: string, removeIndices: number[]): Promise<boolean> {
	const headers = await TidalApi.getAuthHeaders();
	const queryArgs = TidalApi.queryArgs();

	const playlistRes = await fetch(`https://desktop.tidal.com/v1/playlists/${playlistUUID}?${queryArgs}`, { headers });
	if (!playlistRes.ok) return false;

	const etag = playlistRes.headers.get("etag");
	if (etag === null) return false;

	const indices = removeIndices.join(",");
	const deleteRes = await fetch(`https://desktop.tidal.com/v1/playlists/${playlistUUID}/items/${indices}?${queryArgs}`, {
		method: "DELETE",
		headers: {
			...headers,
			"If-None-Match": etag,
		},
	});

	return deleteRes.ok;
}

export async function removeFromFavorites(trackIds: number[], onProgress?: (removed: number, total: number) => void): Promise<boolean> {
	const userId = getUserId();
	if (userId === null) return false;

	const headers = await TidalApi.getAuthHeaders();
	const queryArgs = TidalApi.queryArgs();
	const maxConcurrency = 10;
	let done = 0;
	let running = 0;
	let idx = 0;
	let failed = false;

	await new Promise<void>((resolve) => {
		const launch = () => {
			while (running < maxConcurrency && idx < trackIds.length && !failed) {
				const trackId = trackIds[idx++];
				running++;
				fetch(`https://desktop.tidal.com/v1/users/${userId}/favorites/tracks/${trackId}?${queryArgs}`, {
					method: "DELETE",
					headers,
				})
					.then((res) => { if (!res.ok) failed = true; })
					.catch(() => { failed = true; })
					.finally(() => {
						running--;
						done++;
						onProgress?.(done, trackIds.length);
						if (done === trackIds.length || (failed && running === 0)) resolve();
						else launch();
					});
			}
		};
		if (trackIds.length === 0) resolve();
		else launch();
	});

	return !failed;
}

export interface StreamInfo {
	bitDepth: number;
	sampleRate: number;
}

export async function fetchStreamInfo(trackId: number, audioQuality: string): Promise<StreamInfo | null> {
	try {
		const info = await TidalApi.playbackInfo(trackId as unknown as redux.ItemId, audioQuality as redux.AudioQuality);
		if (info === undefined) return null;
		return { bitDepth: info.bitDepth ?? 0, sampleRate: info.sampleRate ?? 0 };
	} catch {
		return null;
	}
}

export function updateReduxAfterRemoval(playlistUUID: string, removeIndices: number[]): void {
	redux.actions["content/REMOVE_MEDIA_ITEMS_FROM_PLAYLIST_SUCCESS"]({
		currentDirection: "ASC",
		currentOrder: "INDEX",
		playlistUUID,
		removeIndices,
	});
}
