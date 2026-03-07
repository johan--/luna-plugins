import { accessToken } from "./state";
import { ensureValidToken } from "./spotifyAuth";

const BASE = "https://api.spotify.com/v1";

// --- Types ---

export interface SpotifyArtist {
	name: string;
}

export interface SpotifyAlbum {
	name: string;
	artists: SpotifyArtist[];
}

export interface SpotifyTrack {
	id: string | null;
	name: string;
	artists: SpotifyArtist[];
	album: SpotifyAlbum;
	track_number: number;
	duration_ms: number;
	type: string;
	external_ids?: { isrc?: string };
}

export interface SpotifyPlaylist {
	id: string;
	name: string;
	description: string;
	tracks: { total: number };
	owner: { id: string };
}

// --- Internal helpers ---

async function spotifyFetch(url: string, retries = 5): Promise<Response> {
	await ensureValidToken();
	const response = await fetch(url, {
		headers: { Authorization: "Bearer " + accessToken },
	});

	if (response.status === 429) {
		if (retries <= 0) {
			throw new Error("Spotify rate limit exceeded after all retries");
		}
		const retryAfter = Number(response.headers.get("Retry-After") ?? "1");
		await new Promise((resolve) => setTimeout(resolve, retryAfter * 1000));
		return spotifyFetch(url, retries - 1);
	}

	if (!response.ok) {
		throw new Error(`Spotify API error: ${response.status} ${response.statusText}`);
	}

	return response;
}

async function fetchAllPages<T>(
	initialUrl: string,
	extractItems: (data: Record<string, unknown>) => T[],
	onProgress?: (loaded: number, total: number) => void,
): Promise<T[]> {
	const items: T[] = [];
	let url: string | null = initialUrl;

	while (url) {
		const response = await spotifyFetch(url);
		const data = await response.json();

		const pageItems = extractItems(data);
		items.push(...pageItems);

		if (onProgress) {
			onProgress(items.length, data.total as number);
		}

		url = (data.next as string | null) ?? null;
	}

	return items;
}

// --- Exported functions ---

export async function getMe(): Promise<{ id: string; display_name: string }> {
	const response = await spotifyFetch(`${BASE}/me`);
	const data = await response.json();
	return { id: data.id, display_name: data.display_name };
}

export async function getPlaylists(): Promise<SpotifyPlaylist[]> {
	const me = await getMe();
	const playlists = await fetchAllPages<SpotifyPlaylist>(
		`${BASE}/me/playlists?limit=50`,
		(data) => data.items as SpotifyPlaylist[],
	);
	return playlists.filter((p) => p.owner.id === me.id);
}

export async function getPlaylistTracks(
	playlistId: string,
	onProgress?: (loaded: number, total: number) => void,
): Promise<SpotifyTrack[]> {
	const fields = "next,total,limit,items(track(name,album(name,artists),artists,track_number,duration_ms,id,external_ids(isrc),type))";
	const tracks = await fetchAllPages<SpotifyTrack>(
		`${BASE}/playlists/${playlistId}/tracks?limit=100&fields=${encodeURIComponent(fields)}`,
		(data) => {
			const items = data.items as { track: SpotifyTrack | null }[];
			return items.map((i) => i.track).filter((t): t is SpotifyTrack => t !== null);
		},
		onProgress,
	);
	return tracks.filter(
		(t) => t.type === "track" && t.album && t.album.name && t.album.artists && t.album.artists.length > 0,
	);
}

export async function getLikedTracks(onProgress?: (loaded: number, total: number) => void): Promise<SpotifyTrack[]> {
	return fetchAllPages<SpotifyTrack>(
		`${BASE}/me/tracks?limit=50`,
		(data) => {
			const items = data.items as { track: SpotifyTrack | null }[];
			return items.map((i) => i.track).filter((t): t is SpotifyTrack => t !== null);
		},
		onProgress,
	);
}
