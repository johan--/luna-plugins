import type { SpotifyPlaylist } from "./spotifyApi";
import { getPlaylistTracks, getLikedTracks } from "./spotifyApi";
import { matchAllTracks } from "./matching";
import { fetchUserPlaylists, fetchPlaylistTrackIds, fetchFavoriteTrackIds, addTracksToPlaylist, createPlaylist, addToFavorites } from "./tidalApi";
import type { TidalPlaylist } from "./tidalApi";

// --- Types ---

export interface TrackToAdd {
	tidalId: number;
	description: string;
}

export interface SyncPrepResult {
	playlistName: string;
	playlistDescription: string;
	existingUUID: string; // empty if playlist needs to be created
	isFavorites: boolean;
	matched: number;
	unmatched: number;
	alreadyPresent: number;
	tracksToAdd: TrackToAdd[];
	unmatchedTracks: string[];
}

export interface SyncPlaylistResult {
	playlistName: string;
	matched: number;
	unmatched: number;
	added: number;
	alreadyPresent: number;
	addedTracks: string[];
	unmatchedTracks: string[];
}

export type ProgressCallback = (message: string) => void;

// --- Prepare functions (matching only, no side effects except playlist existence check) ---

async function preparePlaylistSync(
	spotifyPlaylist: SpotifyPlaylist,
	tidalPlaylists: TidalPlaylist[],
	onProgress: ProgressCallback,
	signal?: AbortSignal,
): Promise<SyncPrepResult> {
	const name = spotifyPlaylist.name;

	// 1. Fetch Spotify tracks
	onProgress(`Fetching Spotify tracks for "${name}"...`);
	const spotifyTracks = await getPlaylistTracks(spotifyPlaylist.id, (loaded, total) => {
		onProgress(`Fetching Spotify tracks for "${name}": ${loaded}/${total}`);
	});
	if (signal?.aborted) throw new DOMException("Sync cancelled", "AbortError");

	// 2. Check existing Tidal playlist
	let existingTrackIds = new Set<number>();
	let existingUUID = "";
	const existingPlaylist = tidalPlaylists.find((p) => p.title === name);

	if (existingPlaylist) {
		onProgress(`Found existing Tidal playlist "${name}", fetching track IDs...`);
		const trackIdList = await fetchPlaylistTrackIds(existingPlaylist.uuid);
		existingTrackIds = new Set(trackIdList);
		existingUUID = existingPlaylist.uuid;
	}
	if (signal?.aborted) throw new DOMException("Sync cancelled", "AbortError");

	// 3. Match all tracks
	onProgress(`Matching tracks for "${name}"...`);
	const matchResults = await matchAllTracks(spotifyTracks, existingTrackIds, (matched, total, unmatchedList) => {
		onProgress(`Matching "${name}": ${matched}/${total} matched, ${unmatchedList.length} unmatched`);
	}, signal);

	// 4. Compute results
	let matched = 0;
	let unmatched = 0;
	let alreadyPresent = 0;
	const unmatchedTracks: string[] = [];
	const tracksToAdd: TrackToAdd[] = [];
	const seenIds = new Set<number>();

	for (const result of matchResults) {
		if (result === undefined) continue;
		const trackDesc = `${result.spotifyTrack.artists.map((a) => a.name).join(", ")} - ${result.spotifyTrack.name}`;
		if (result.tidalId !== null) {
			matched++;
			if (existingTrackIds.has(result.tidalId)) {
				alreadyPresent++;
			} else if (!seenIds.has(result.tidalId)) {
				tracksToAdd.push({ tidalId: result.tidalId, description: trackDesc });
				seenIds.add(result.tidalId);
			}
		} else {
			unmatched++;
			unmatchedTracks.push(trackDesc);
		}
	}

	return {
		playlistName: name,
		playlistDescription: spotifyPlaylist.description ?? "",
		existingUUID,
		isFavorites: false,
		matched,
		unmatched,
		alreadyPresent,
		tracksToAdd,
		unmatchedTracks,
	};
}

async function prepareFavoritesSync(
	onProgress: ProgressCallback,
	signal?: AbortSignal,
): Promise<SyncPrepResult> {
	// 1. Fetch liked tracks
	onProgress("Fetching Spotify liked tracks...");
	const spotifyTracks = await getLikedTracks((loaded, total) => {
		onProgress(`Fetching liked tracks: ${loaded}/${total}`);
	});
	if (signal?.aborted) throw new DOMException("Sync cancelled", "AbortError");

	// 2. Fetch existing Tidal favorites
	onProgress("Fetching existing Tidal favorites...");
	const existingFavIds = await fetchFavoriteTrackIds(onProgress);
	const existingTrackIds = new Set(existingFavIds);
	onProgress(`Found ${existingTrackIds.size} existing Tidal favorites`);
	if (signal?.aborted) throw new DOMException("Sync cancelled", "AbortError");

	// 3. Match tracks
	onProgress("Matching liked tracks...");
	const matchResults = await matchAllTracks(spotifyTracks, existingTrackIds, (matched, total, unmatchedList) => {
		onProgress(`Matching favorites: ${matched}/${total} matched, ${unmatchedList.length} unmatched`);
	}, signal);

	// 4. Collect results
	let matched = 0;
	let unmatched = 0;
	let alreadyPresent = 0;
	const unmatchedTracks: string[] = [];
	const tracksToAdd: TrackToAdd[] = [];
	const seenIds = new Set<number>();

	for (const result of matchResults) {
		if (result === undefined) continue;
		const trackDesc = `${result.spotifyTrack.artists.map((a) => a.name).join(", ")} - ${result.spotifyTrack.name}`;
		if (result.tidalId !== null) {
			matched++;
			if (existingTrackIds.has(result.tidalId)) {
				alreadyPresent++;
			} else if (!seenIds.has(result.tidalId)) {
				tracksToAdd.push({ tidalId: result.tidalId, description: trackDesc });
				seenIds.add(result.tidalId);
			}
		} else {
			unmatched++;
			unmatchedTracks.push(trackDesc);
		}
	}

	return {
		playlistName: "Favorites",
		playlistDescription: "",
		existingUUID: "",
		isFavorites: true,
		matched,
		unmatched,
		alreadyPresent,
		tracksToAdd,
		unmatchedTracks,
	};
}

export async function prepareAll(
	selectedPlaylists: SpotifyPlaylist[],
	doSyncFavorites: boolean,
	onProgress: ProgressCallback,
	onPrepared: (result: SyncPrepResult) => void,
	signal?: AbortSignal,
): Promise<SyncPrepResult[]> {
	const results: SyncPrepResult[] = [];

	onProgress("Fetching Tidal playlists...");
	const tidalPlaylists = await fetchUserPlaylists();

	for (const playlist of selectedPlaylists) {
		if (signal?.aborted) break;
		try {
			const result = await preparePlaylistSync(playlist, tidalPlaylists, onProgress, signal);
			results.push(result);
			onPrepared(result);
		} catch (error) {
			if (error instanceof DOMException && error.name === "AbortError") break;
			results.push({
				playlistName: playlist.name,
				playlistDescription: "",
				existingUUID: "",
				isFavorites: false,
				matched: 0,
				unmatched: 0,
				alreadyPresent: 0,
				tracksToAdd: [],
				unmatchedTracks: [`Error: ${error instanceof Error ? error.message : String(error)}`],
			});
		}
	}

	if (doSyncFavorites && !signal?.aborted) {
		try {
			const result = await prepareFavoritesSync(onProgress, signal);
			results.push(result);
			onPrepared(result);
		} catch (error) {
			if (!(error instanceof DOMException && error.name === "AbortError")) {
				results.push({
					playlistName: "Favorites",
					playlistDescription: "",
					existingUUID: "",
					isFavorites: true,
					matched: 0,
					unmatched: 0,
					alreadyPresent: 0,
					tracksToAdd: [],
					unmatchedTracks: [`Error: ${error instanceof Error ? error.message : String(error)}`],
				});
			}
		}
	}

	return results;
}

// --- Execute functions (actually add tracks) ---

export async function executeAll(
	prepResults: SyncPrepResult[],
	onProgress: ProgressCallback,
	onDone: (result: SyncPlaylistResult) => void,
	signal?: AbortSignal,
): Promise<SyncPlaylistResult[]> {
	const results: SyncPlaylistResult[] = [];

	for (const prep of prepResults) {
		if (signal?.aborted) break;

		const trackIds = prep.tracksToAdd.map((t) => t.tidalId);
		const addedDescriptions = prep.tracksToAdd.map((t) => t.description);

		try {
			if (trackIds.length > 0) {
				if (prep.isFavorites) {
					onProgress(`Adding ${trackIds.length} tracks to favorites...`);
					addToFavorites(trackIds);
					onProgress(`Added ${trackIds.length} tracks to favorites`);
				} else {
					let targetUUID = prep.existingUUID;
					if (!targetUUID) {
						onProgress(`Creating Tidal playlist "${prep.playlistName}"...`);
						targetUUID = await createPlaylist(prep.playlistName, prep.playlistDescription);
						if (!targetUUID) {
							const refreshed = await fetchUserPlaylists();
							const created = refreshed.find((p) => p.title === prep.playlistName);
							if (!created) throw new Error(`Could not find newly created playlist "${prep.playlistName}"`);
							targetUUID = created.uuid;
						}
					}
					onProgress(`Adding ${trackIds.length} tracks to "${prep.playlistName}"...`);
					await addTracksToPlaylist(targetUUID, trackIds, (added, total) => {
						onProgress(`Adding tracks to "${prep.playlistName}": ${added}/${total}`);
					});
					onProgress(`Added ${trackIds.length} tracks to "${prep.playlistName}"`);
				}
			} else {
				onProgress(`No new tracks to add to "${prep.playlistName}"`);
			}
		} catch (error) {
			if (error instanceof DOMException && error.name === "AbortError") break;
		}

		const result: SyncPlaylistResult = {
			playlistName: prep.playlistName,
			matched: prep.matched,
			unmatched: prep.unmatched,
			added: trackIds.length,
			alreadyPresent: prep.alreadyPresent,
			addedTracks: addedDescriptions,
			unmatchedTracks: prep.unmatchedTracks,
		};
		results.push(result);
		onDone(result);
	}

	return results;
}
