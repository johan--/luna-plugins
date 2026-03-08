import { TidalApi } from "@luna/lib";
import type { SpotifyTrack } from "./spotifyApi";

// --- Internal types ---

interface TidalTrackResult {
	id: number;
	title: string;
	version?: string;
	duration: number;
	isrc?: string;
	artists: { name: string }[];
}

// --- String helpers (ported from sync.py) ---

function normalize(s: string): string {
	// NFD normalize, strip combining marks (accents), lowercase, trim
	return s
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase()
		.trim();
}

function simple(input: string): string {
	// Take text before first hyphen, parenthesis, or bracket
	return input.split("-")[0].trim().split("(")[0].trim().split("[")[0].trim();
}

function splitArtists(name: string): string[] {
	if (name.includes("&")) return name.split("&").map((s) => s.trim());
	if (name.includes(",")) return name.split(",").map((s) => s.trim());
	return [name];
}

// --- Match functions ---

function isrcMatch(tidalIsrc: string | undefined, spotifyTrack: SpotifyTrack): boolean {
	const spotifyIsrc = spotifyTrack.external_ids?.isrc;
	if (!spotifyIsrc || !tidalIsrc) return false;
	return tidalIsrc.toUpperCase() === spotifyIsrc.toUpperCase();
}

function durationMatch(tidalDurationSec: number, spotifyTrack: SpotifyTrack, tolerance = 2): boolean {
	return Math.abs(tidalDurationSec - spotifyTrack.duration_ms / 1000) < tolerance;
}

function nameMatch(tidalName: string, tidalVersion: string | undefined, spotifyTrack: SpotifyTrack): boolean {
	const tidalLower = tidalName.toLowerCase();
	const tidalVersionLower = tidalVersion?.toLowerCase() ?? "";

	// Exclusion rules: if one side has the pattern and the other doesn't, reject
	for (const pattern of ["instrumental", "acapella", "remix"]) {
		const spotifyHas = spotifyTrack.name.toLowerCase().includes(pattern);
		const tidalHas = tidalLower.includes(pattern) || tidalVersionLower.includes(pattern);
		if (spotifyHas !== tidalHas) return false;
	}

	// The simplified Spotify track name must be a substring of the Tidal track name
	// Try both un-normalized and normalized
	const simpleSpotify = simple(spotifyTrack.name.toLowerCase()).split("feat.")[0].trim();
	return tidalLower.includes(simpleSpotify) || normalize(tidalLower).includes(normalize(simpleSpotify));
}

function artistMatch(tidalArtists: string[], spotifyTrack: SpotifyTrack): boolean {
	const getTidal = (doNorm: boolean): Set<string> => {
		const names: string[] = [];
		for (const a of tidalArtists) names.push(...splitArtists(doNorm ? normalize(a) : a));
		return new Set(names.map((n) => simple(n.trim().toLowerCase())));
	};
	const getSpotify = (doNorm: boolean): Set<string> => {
		const names: string[] = [];
		for (const a of spotifyTrack.artists) names.push(...splitArtists(doNorm ? normalize(a.name) : a.name));
		return new Set(names.map((n) => simple(n.trim().toLowerCase())));
	};

	// Check overlap with and without normalization
	for (const doNorm of [false, true]) {
		const tidal = getTidal(doNorm);
		const spotify = getSpotify(doNorm);
		for (const name of tidal) {
			if (spotify.has(name)) return true;
		}
	}
	return false;
}

function matchTrack(tidal: TidalTrackResult, spotify: SpotifyTrack): boolean {
	return (
		isrcMatch(tidal.isrc, spotify) ||
		(durationMatch(tidal.duration, spotify) && nameMatch(tidal.title, tidal.version, spotify) && artistMatch(tidal.artists.map((a) => a.name), spotify))
	);
}

// --- ISRC lookup via TidalApi ---

async function isrcLookup(isrc: string): Promise<TidalTrackResult | null> {
	try {
		for await (const track of TidalApi.isrc(isrc)) {
			return track as unknown as TidalTrackResult;
		}
	} catch {
		/* no match */
	}
	return null;
}

// --- Search fallback via Tidal search API ---

async function searchTidal(query: string): Promise<TidalTrackResult[]> {
	const headers = await TidalApi.getAuthHeaders();
	const queryArgs = TidalApi.queryArgs();
	const res = await fetch(`https://desktop.tidal.com/v1/search/tracks?${queryArgs}&query=${encodeURIComponent(query)}&limit=20`, { headers });
	if (!res.ok) return [];
	const data = await res.json();
	return (data.items ?? []) as TidalTrackResult[];
}

// --- Exported types and classes ---

export class Semaphore {
	private queue: (() => void)[] = [];
	private count: number;
	constructor(max: number) {
		this.count = max;
	}
	async acquire(): Promise<void> {
		if (this.count > 0) {
			this.count--;
			return;
		}
		return new Promise((resolve) =>
			this.queue.push(() => {
				this.count--;
				resolve();
			}),
		);
	}
	release(): void {
		this.count++;
		const next = this.queue.shift();
		if (next) next();
	}
}

export interface MatchResult {
	spotifyTrack: SpotifyTrack;
	tidalId: number | null;
}

// --- Main matching functions ---

export async function matchSpotifyTrack(spotifyTrack: SpotifyTrack, sem: Semaphore): Promise<number | null> {
	if (!spotifyTrack.id) return null;

	await sem.acquire();
	try {
		// Phase 1: ISRC lookup
		const isrc = spotifyTrack.external_ids?.isrc;
		if (isrc) {
			const result = await isrcLookup(isrc);
			if (result) return result.id;
		}

		// Phase 2: Search fallback
		const query = `${simple(spotifyTrack.name)} ${simple(spotifyTrack.artists[0].name)}`;
		const results = await searchTidal(query);
		for (const track of results) {
			if (matchTrack(track, spotifyTrack)) return track.id;
		}
	} finally {
		sem.release();
	}

	return null;
}

export async function matchAllTracks(
	spotifyTracks: SpotifyTrack[],
	existingTidalTrackIds: Set<number>,
	onProgress?: (matched: number, total: number, unmatched: string[]) => void,
	signal?: AbortSignal,
	matchCache?: Record<string, number>,
): Promise<MatchResult[]> {
	const sem = new Semaphore(10);
	const results: MatchResult[] = new Array(spotifyTracks.length);
	const unmatched: string[] = [];
	let matched = 0;
	let completed = 0;

	const matchOne = async (i: number) => {
		if (signal?.aborted) return;
		const st = spotifyTracks[i];

		// Check match cache first
		if (st.id && matchCache && st.id in matchCache) {
			const cachedId = matchCache[st.id];
			results[i] = { spotifyTrack: st, tidalId: cachedId };
			matched++;
			completed++;
			if (completed % 10 === 0 || completed === spotifyTracks.length) {
				onProgress?.(matched, spotifyTracks.length, unmatched);
			}
			return;
		}

		const tidalId = await matchSpotifyTrack(st, sem);
		if (signal?.aborted) return;
		results[i] = { spotifyTrack: st, tidalId };
		if (tidalId !== null) {
			matched++;
			// Write successful match to cache
			if (st.id && matchCache) {
				matchCache[st.id] = tidalId;
			}
		} else {
			unmatched.push(`${st.artists.map((a) => a.name).join(", ")} - ${st.name}`);
		}
		completed++;
		if (completed % 10 === 0 || completed === spotifyTracks.length) {
			onProgress?.(matched, spotifyTracks.length, unmatched);
		}
	};

	// Run all lookups concurrently, throttled by the semaphore
	await Promise.all(spotifyTracks.map((_, i) => matchOne(i)));

	if (signal?.aborted) throw new DOMException("Sync cancelled", "AbortError");
	return results;
}
