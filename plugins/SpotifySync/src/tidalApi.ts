import { redux, TidalApi } from "@luna/lib";

export interface TidalPlaylist {
	uuid: string;
	title: string;
	numberOfTracks: number;
	type: string;
}

export interface TidalTrackInfo {
	id: number;
	title: string;
	duration: number; // seconds
	artists: { name: string }[];
}

function getUserId(): number | null {
	const state = redux.store.getState();
	return state.session?.userId ?? null;
}

export async function fetchUserPlaylists(): Promise<TidalPlaylist[]> {
	const userId = getUserId();
	if (userId === null) throw new Error("Not logged in");

	const headers = await TidalApi.getAuthHeaders();
	const queryArgs = TidalApi.queryArgs();
	const res = await fetch(`https://desktop.tidal.com/v1/users/${userId}/playlists?${queryArgs}&limit=999`, { headers });
	if (!res.ok) throw new Error(`Failed to fetch playlists: ${res.status}`);

	const data = (await res.json()) as { items: TidalPlaylist[] };
	return data.items;
}

export async function fetchPlaylistTracks(playlistUUID: string): Promise<TidalTrackInfo[]> {
	const headers = await TidalApi.getAuthHeaders();
	const queryArgs = TidalApi.queryArgs();
	const tracks: TidalTrackInfo[] = [];
	let offset = 0;
	const limit = 100;

	while (true) {
		const res = await fetch(
			`https://desktop.tidal.com/v1/playlists/${playlistUUID}/items?${queryArgs}&limit=${limit}&offset=${offset}`,
			{ headers },
		);
		if (!res.ok) throw new Error(`Failed to fetch playlist items: ${res.status}`);
		const data = (await res.json()) as { items: { item: TidalTrackInfo }[] };
		const items = data.items ?? [];
		if (items.length === 0) break;
		for (const item of items) {
			tracks.push({ id: item.item.id, title: item.item.title, duration: item.item.duration, artists: item.item.artists });
		}
		if (items.length < limit) break;
		offset += limit;
	}

	return tracks;
}

export async function addTracksToPlaylist(playlistUUID: string, trackIds: number[], onProgress?: (added: number, total: number) => void): Promise<void> {
	const chunkSize = 20;
	const total = trackIds.length;
	let added = 0;

	for (let i = 0; i < total; i += chunkSize) {
		const batch = trackIds.slice(i, i + chunkSize);

		const headers = await TidalApi.getAuthHeaders();
		const queryArgs = TidalApi.queryArgs();

		// Get ETag
		const playlistRes = await fetch(`https://desktop.tidal.com/v1/playlists/${playlistUUID}?${queryArgs}`, { headers });
		if (!playlistRes.ok) throw new Error(`Failed to fetch playlist for ETag: ${playlistRes.status}`);

		const etag = playlistRes.headers.get("etag");
		if (etag === null) throw new Error("Failed to get ETag from playlist response");

		// Add tracks
		const addRes = await fetch(`https://desktop.tidal.com/v1/playlists/${playlistUUID}/items?${queryArgs}`, {
			method: "POST",
			headers: {
				...headers,
				"Content-Type": "application/x-www-form-urlencoded",
				"If-None-Match": etag,
			},
			body: `trackIds=${batch.join(",")}&onDupes=SKIP`,
		});
		if (!addRes.ok) throw new Error(`Failed to add tracks to playlist: ${addRes.status}`);

		added += batch.length;
		onProgress?.(added, total);
	}
}

export function createPlaylist(title: string, description?: string): Promise<string> {
	return new Promise<string>((resolve, reject) => {
		const localUnloads = new Set<() => void>();

		const timeout = setTimeout(() => {
			for (const unsub of localUnloads) unsub();
			localUnloads.clear();
			reject(new Error("Timed out waiting for playlist creation"));
		}, 10_000);

		redux.intercept("folders/CREATE_PLAYLIST_SUCCESS" as any, localUnloads, (payload: any) => {
			clearTimeout(timeout);
			for (const unsub of localUnloads) unsub();
			localUnloads.clear();
			resolve(payload.uuid ?? payload.playlist?.uuid ?? "");
		});

		redux.store.dispatch({
			type: "folders/CREATE_PLAYLIST",
			payload: { title, description: description ?? "" },
		} as any);
	});
}

export async function fetchFavoriteTracks(onProgress?: (message: string) => void): Promise<TidalTrackInfo[]> {
	const userId = getUserId();
	if (userId === null) throw new Error("Not logged in");

	const headers = await TidalApi.getAuthHeaders();
	const queryArgs = TidalApi.queryArgs();
	const tracks: TidalTrackInfo[] = [];
	let offset = 0;
	const limit = 100;

	while (true) {
		const res = await fetch(
			`https://desktop.tidal.com/v1/users/${userId}/favorites/tracks?${queryArgs}&limit=${limit}&offset=${offset}`,
			{ headers },
		);
		if (!res.ok) throw new Error(`Failed to fetch favorites: ${res.status}`);
		const data = (await res.json()) as { items: { item: TidalTrackInfo }[] };
		const items = data.items ?? [];
		if (items.length === 0) break;
		for (const item of items) {
			tracks.push({ id: item.item.id, title: item.item.title, duration: item.item.duration, artists: item.item.artists });
		}
		onProgress?.(`Fetching Tidal favorites: ${tracks.length} loaded...`);
		if (items.length < limit) break;
		offset += limit;
	}

	return tracks;
}

export function addToFavorites(trackIds: number[]): void {
	redux.store.dispatch({
		type: "content/ADD_MEDIA_ITEM_IDS_TO_FAVORITES",
		payload: { mediaItemIds: trackIds.map(String), from: "SpotifySync" },
	} as any);
}
