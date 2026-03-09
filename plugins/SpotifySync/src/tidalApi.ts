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
	version: string | null;
	duration: number; // seconds
	isrc: string | null;
	artists: { name: string }[];
}

async function fetchWithRetry(url: string, init: RequestInit, retries = 3): Promise<Response> {
	for (let attempt = 0; ; attempt++) {
		const res = await fetch(url, init);
		if (res.ok || attempt >= retries) return res;
		await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
	}
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
	const res = await fetchWithRetry(
		`https://desktop.tidal.com/v1/playlists/${playlistUUID}/items?${queryArgs}&limit=-1`,
		{ headers },
	);
	if (!res.ok) throw new Error(`Failed to fetch playlist items: ${res.status}`);
	const data = (await res.json()) as { items: { item: TidalTrackInfo | null }[] };
	const tracks: TidalTrackInfo[] = [];
	for (const entry of (data.items ?? [])) {
		if (entry.item) {
			tracks.push({ id: entry.item.id, title: entry.item.title, version: entry.item.version ?? null, duration: entry.item.duration, isrc: (entry.item as any).isrc ?? null, artists: entry.item.artists });
		}
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
	const limit = 9999;
	let total = Infinity;

	while (offset < total) {
		onProgress?.(`Fetching Tidal favorites${tracks.length > 0 ? `: ${tracks.length} loaded...` : "..."}`);
		const res = await fetchWithRetry(
			`https://desktop.tidal.com/v1/users/${userId}/favorites/tracks?${queryArgs}&limit=${limit}&offset=${offset}&order=DATE&orderDirection=ASC`,
			{ headers },
		);
		if (!res.ok) throw new Error(`Failed to fetch favorites: ${res.status}`);
		const data = (await res.json()) as { totalNumberOfItems?: number; items: { item: TidalTrackInfo | null }[] };
		if (data.totalNumberOfItems !== undefined) total = data.totalNumberOfItems;
		const items = data.items ?? [];
		if (items.length === 0) break;
		for (const entry of items) {
			if (entry.item) {
				tracks.push({ id: entry.item.id, title: entry.item.title, version: entry.item.version ?? null, duration: entry.item.duration, isrc: (entry.item as any).isrc ?? null, artists: entry.item.artists });
			}
		}
		offset += items.length;
	}

	onProgress?.(`Fetched ${tracks.length} Tidal favorites`);
	return tracks;
}

export function addToFavorites(trackIds: number[]): void {
	redux.store.dispatch({
		type: "content/ADD_MEDIA_ITEM_IDS_TO_FAVORITES",
		payload: { mediaItemIds: trackIds.map(String), from: "SpotifySync" },
	} as any);
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

export async function removeFromFavorites(trackIds: number[]): Promise<boolean> {
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
