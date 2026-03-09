import anyAscii from "any-ascii";
import type { SpotifyPlaylist } from "./spotifyApi";
import { getPlaylistTracks, getLikedTracks } from "./spotifyApi";
import { matchAllTracks } from "./matching";
import { fetchUserPlaylists, fetchPlaylistTracks, fetchFavoriteTracks, addTracksToPlaylist, createPlaylist, addToFavorites, removeFromPlaylist, removeFromFavorites } from "./tidalApi";
import type { TidalPlaylist, TidalTrackInfo } from "./tidalApi";
import { getMatchCache, saveMatchCache, getSimilarDecisions } from "./state";

// --- Types ---

export interface SimilarVersion {
	tidalId: number;
	playlistIndex: number; // position in playlist (-1 for favorites)
	description: string;
	duration: number; // seconds
}

export interface TrackToAdd {
	tidalId: number;
	spotifyTrackId: string;
	description: string;
	duration: number; // seconds
	similarExisting?: SimilarVersion[];
}

export interface TrackToRemove {
	tidalId: number;
	playlistIndex: number;
	description: string;
}

export interface SyncPrepResult {
	playlistName: string;
	spotifyPlaylistId: string;
	playlistDescription: string;
	existingUUID: string; // empty if playlist needs to be created
	isFavorites: boolean;
	matched: number;
	unmatched: number;
	alreadyPresent: number;
	tracksToAdd: TrackToAdd[];
	tracksToRemove: TrackToRemove[];
	unmatchedTracks: string[];
}

export interface SyncPlaylistResult {
	playlistName: string;
	matched: number;
	unmatched: number;
	added: number;
	removed: number;
	alreadyPresent: number;
	addedTracks: string[];
	removedTracks: string[];
	unmatchedTracks: string[];
}

export type ProgressCallback = (message: string) => void;

// --- Similarity helpers ---

/** Builds a key for fuzzy track comparison, transliterating non-Latin scripts and stripping suffixes/punctuation */
function trackSimilarityKey(name: string, artist: string): string {
	const n = anyAscii(name)
		.split("-")[0]
		.split("(")[0]
		.split("[")[0]
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]/g, "");
	const a = anyAscii(artist)
		.split("&")[0]
		.split(",")[0]
		.split("-")[0]
		.split("(")[0]
		.split("[")[0]
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]/g, "");
	return `${n}|${a}`;
}

interface SimilarTrackEntry {
	tidalId: number;
	playlistIndex: number;
	description: string;
	duration: number; // seconds
}

/** Builds a similarity index from existing Tidal tracks */
function buildSimilarityIndex(existingTracks: TidalTrackInfo[]): Map<string, SimilarTrackEntry[]> {
	const index = new Map<string, SimilarTrackEntry[]>();
	for (let i = 0; i < existingTracks.length; i++) {
		const track = existingTracks[i];
		const key = trackSimilarityKey(track.title, track.artists[0]?.name ?? "");
		const entry: SimilarTrackEntry = {
			tidalId: track.id,
			playlistIndex: i,
			description: `${track.artists.map((a) => a.name).join(", ")} - ${track.title}`,
			duration: track.duration,
		};
		const list = index.get(key);
		if (list) list.push(entry);
		else index.set(key, [entry]);
	}
	return index;
}

/**
 * Check if a Spotify track has similar existing versions.
 * Returns "exact" if name+artist+duration match (same recording).
 * Returns SimilarVersion[] if name+artist match but duration differs.
 * Returns undefined if no similar track.
 */
function checkSimilarity(
	similarityIndex: Map<string, SimilarTrackEntry[]>,
	spotifyName: string,
	spotifyArtist: string,
	spotifyDurationMs: number,
): "exact" | SimilarVersion[] | undefined {
	const key = trackSimilarityKey(spotifyName, spotifyArtist);
	const entries = similarityIndex.get(key);
	if (!entries) return undefined;

	const spotifyDurationSec = spotifyDurationMs / 1000;
	// Check if any existing track has a matching duration (same recording, different ID)
	for (const entry of entries) {
		if (Math.abs(entry.duration - spotifyDurationSec) < 2) return "exact";
	}
	// Duration differs — return all similar versions
	return entries.map((entry) => ({
		tidalId: entry.tidalId,
		playlistIndex: entry.playlistIndex,
		description: entry.description,
		duration: entry.duration,
	}));
}

// --- Prepare functions ---

async function preparePlaylistSync(
	spotifyPlaylist: SpotifyPlaylist,
	tidalPlaylists: TidalPlaylist[],
	onProgress: ProgressCallback,
	signal?: AbortSignal,
): Promise<SyncPrepResult> {
	const name = spotifyPlaylist.name;
	const playlistKey = spotifyPlaylist.id;
	const matchCache = getMatchCache(playlistKey);
	const decisions = getSimilarDecisions(playlistKey);

	// 1. Fetch Spotify tracks
	onProgress(`Fetching Spotify tracks for "${name}"...`);
	const spotifyTracks = await getPlaylistTracks(spotifyPlaylist.id, (loaded, total) => {
		onProgress(`Fetching Spotify tracks for "${name}": ${loaded}/${total}`);
	});
	if (signal?.aborted) throw new DOMException("Sync cancelled", "AbortError");

	// 2. Check existing Tidal playlist — fetch full track metadata
	let existingTracks: TidalTrackInfo[] = [];
	let existingTrackIds = new Set<number>();
	let existingUUID = "";
	const existingPlaylist = tidalPlaylists.find((p) => p.title === name);

	if (existingPlaylist) {
		onProgress(`Found existing Tidal playlist "${name}", fetching tracks...`);
		existingTracks = await fetchPlaylistTracks(existingPlaylist.uuid);
		existingTrackIds = new Set(existingTracks.map((t) => t.id));
		existingUUID = existingPlaylist.uuid;
		onProgress(`Tidal playlist "${name}" has ${existingTrackIds.size} existing tracks`);
	}
	if (signal?.aborted) throw new DOMException("Sync cancelled", "AbortError");

	// Build similarity index for fuzzy comparison
	const similarityIndex = buildSimilarityIndex(existingTracks);

	// 3. Match all tracks
	onProgress(`Matching tracks for "${name}"...`);
	const matchResults = await matchAllTracks(spotifyTracks, existingTrackIds, (matched, total, unmatchedList) => {
		onProgress(`Matching "${name}": ${matched}/${total} matched, ${unmatchedList.length} unmatched`);
	}, signal, matchCache);

	// Save updated match cache
	saveMatchCache(playlistKey, matchCache);

	// 4. Compute results with similarity detection
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
				const sim = checkSimilarity(
					similarityIndex,
					result.spotifyTrack.name,
					result.spotifyTrack.artists[0]?.name ?? "",
					result.spotifyTrack.duration_ms,
				);
				if (sim === "exact") {
					// Same name+artist+duration — silently skip
					alreadyPresent++;
				} else {
					const spotifyId = result.spotifyTrack.id;
					if (spotifyId && spotifyId in decisions) {
						if (decisions[spotifyId] === "keep-existing") {
							alreadyPresent++;
						} else {
							tracksToAdd.push({
								tidalId: result.tidalId,
								spotifyTrackId: spotifyId,
								description: trackDesc,
								duration: result.spotifyTrack.duration_ms / 1000,
							});
							seenIds.add(result.tidalId);
						}
					} else {
						tracksToAdd.push({
							tidalId: result.tidalId,
							spotifyTrackId: spotifyId ?? "",
							description: trackDesc,
							duration: result.spotifyTrack.duration_ms / 1000,
							similarExisting: sim === undefined ? undefined : sim,
						});
						seenIds.add(result.tidalId);
					}
				}
			}
		} else {
			const sim = checkSimilarity(
				similarityIndex,
				result.spotifyTrack.name,
				result.spotifyTrack.artists[0]?.name ?? "",
				result.spotifyTrack.duration_ms,
			);
			if (sim !== undefined) {
				alreadyPresent++;
			} else {
				unmatched++;
				unmatchedTracks.push(trackDesc);
			}
		}
	}

	return {
		playlistName: name,
		spotifyPlaylistId: playlistKey,
		playlistDescription: spotifyPlaylist.description ?? "",
		existingUUID,
		isFavorites: false,
		matched,
		unmatched,
		alreadyPresent,
		tracksToAdd,
		tracksToRemove: [],
		unmatchedTracks,
	};
}

async function prepareFavoritesSync(
	onProgress: ProgressCallback,
	signal?: AbortSignal,
): Promise<SyncPrepResult> {
	// 1. Fetch liked tracks
	onProgress("Fetching Spotify liked tracks...");
	const playlistKey = "favorites";
	const matchCache = getMatchCache(playlistKey);
	const decisions = getSimilarDecisions(playlistKey);
	const spotifyTracks = await getLikedTracks((loaded, total) => {
		onProgress(`Fetching liked tracks: ${loaded}/${total}`);
	});
	if (signal?.aborted) throw new DOMException("Sync cancelled", "AbortError");

	// 2. Fetch existing Tidal favorites with metadata
	onProgress("Fetching existing Tidal favorites...");
	const existingTracks = await fetchFavoriteTracks(onProgress);
	const existingTrackIds = new Set(existingTracks.map((t) => t.id));
	onProgress(`Found ${existingTrackIds.size} existing Tidal favorites`);
	if (signal?.aborted) throw new DOMException("Sync cancelled", "AbortError");

	// Build similarity index
	const similarityIndex = buildSimilarityIndex(existingTracks);

	// 3. Match tracks
	onProgress("Matching liked tracks...");
	const matchResults = await matchAllTracks(spotifyTracks, existingTrackIds, (matched, total, unmatchedList) => {
		onProgress(`Matching favorites: ${matched}/${total} matched, ${unmatchedList.length} unmatched`);
	}, signal, matchCache);

	saveMatchCache(playlistKey, matchCache);

	// 4. Collect results with similarity detection
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
				const sim = checkSimilarity(
					similarityIndex,
					result.spotifyTrack.name,
					result.spotifyTrack.artists[0]?.name ?? "",
					result.spotifyTrack.duration_ms,
				);
				if (sim === "exact") {
					alreadyPresent++;
				} else {
					const spotifyId = result.spotifyTrack.id;
					if (spotifyId && spotifyId in decisions) {
						if (decisions[spotifyId] === "keep-existing") {
							alreadyPresent++;
						} else {
							tracksToAdd.push({
								tidalId: result.tidalId,
								spotifyTrackId: spotifyId,
								description: trackDesc,
								duration: result.spotifyTrack.duration_ms / 1000,
							});
							seenIds.add(result.tidalId);
						}
					} else {
						tracksToAdd.push({
							tidalId: result.tidalId,
							spotifyTrackId: spotifyId ?? "",
							description: trackDesc,
							duration: result.spotifyTrack.duration_ms / 1000,
							similarExisting: sim === undefined ? undefined : sim,
						});
						seenIds.add(result.tidalId);
					}
				}
			}
		} else {
			const sim = checkSimilarity(
				similarityIndex,
				result.spotifyTrack.name,
				result.spotifyTrack.artists[0]?.name ?? "",
				result.spotifyTrack.duration_ms,
			);
			if (sim !== undefined) {
				alreadyPresent++;
			} else {
				unmatched++;
				unmatchedTracks.push(trackDesc);
			}
		}
	}

	return {
		playlistName: "Favorites",
		spotifyPlaylistId: "favorites",
		playlistDescription: "",
		existingUUID: "",
		isFavorites: true,
		matched,
		unmatched,
		alreadyPresent,
		tracksToAdd,
		tracksToRemove: [],
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
				spotifyPlaylistId: playlist.id,
				playlistDescription: "",
				existingUUID: "",
				isFavorites: false,
				matched: 0,
				unmatched: 0,
				alreadyPresent: 0,
				tracksToAdd: [],
				tracksToRemove: [],
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
					spotifyPlaylistId: "favorites",
					playlistDescription: "",
					existingUUID: "",
					isFavorites: true,
					matched: 0,
					unmatched: 0,
					alreadyPresent: 0,
					tracksToAdd: [],
					tracksToRemove: [],
					unmatchedTracks: [`Error: ${error instanceof Error ? error.message : String(error)}`],
				});
			}
		}
	}

	return results;
}

// --- Execute functions ---

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
		const removeDescriptions = prep.tracksToRemove.map((t) => t.description);
		let removedCount = 0;

		try {
			// Phase 1: Remove tracks first (before adding)
			if (prep.tracksToRemove.length > 0) {
				if (prep.isFavorites) {
					onProgress(`Removing ${prep.tracksToRemove.length} tracks from favorites...`);
					const removeIds = prep.tracksToRemove.map((t) => t.tidalId);
					const ok = await removeFromFavorites(removeIds);
					if (ok) removedCount = prep.tracksToRemove.length;
				} else if (prep.existingUUID) {
					onProgress(`Removing ${prep.tracksToRemove.length} tracks from "${prep.playlistName}"...`);
					const removeIndices = prep.tracksToRemove.map((t) => t.playlistIndex);
					const ok = await removeFromPlaylist(prep.existingUUID, removeIndices);
					if (ok) removedCount = prep.tracksToRemove.length;
				}
			}

			// Phase 2: Add tracks
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
			} else if (removedCount === 0) {
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
			removed: removedCount,
			alreadyPresent: prep.alreadyPresent,
			addedTracks: addedDescriptions,
			removedTracks: removeDescriptions,
			unmatchedTracks: prep.unmatchedTracks,
		};
		results.push(result);
		onDone(result);
	}

	return results;
}
