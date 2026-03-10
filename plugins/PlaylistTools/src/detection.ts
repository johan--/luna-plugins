export interface TrackItem {
	item: {
		id: number;
		title: string;
		version?: string;
		duration: number;
		isrc?: string;
		artists: { id: number; name: string }[];
		album?: { title: string; releaseDate?: string };
		streamStartDate?: string;
		audioQuality?: string;
	};
}

export function fullTitle(item: { title: string; version?: string }): string {
	return item.version ? `${item.title} ${item.version}` : item.title;
}

export interface IndexedTrack {
	index: number;
	track: TrackItem;
}

export type DuplicateGroup = IndexedTrack[];

function normalize(s: string): string {
	return s.normalize("NFC").toLowerCase().trim();
}

function sameArtist(a: TrackItem, b: TrackItem): boolean {
	const artistsA = new Set(a.item.artists.map((ar) => normalize(ar.name)));
	const artistsB = new Set(b.item.artists.map((ar) => normalize(ar.name)));
	for (const name of artistsA) {
		if (artistsB.has(name)) return true;
	}
	return false;
}

function groupById(tracks: IndexedTrack[]): DuplicateGroup[] {
	const buckets = new Map<number, DuplicateGroup>();
	for (const t of tracks) {
		const id = t.track.item.id;
		const group = buckets.get(id);
		if (group !== undefined) group.push(t);
		else buckets.set(id, [t]);
	}
	return [...buckets.values()].filter((g) => g.length >= 2);
}

function groupByIsrc(tracks: IndexedTrack[]): DuplicateGroup[] {
	const buckets = new Map<string, DuplicateGroup>();
	for (const t of tracks) {
		const isrc = t.track.item.isrc;
		if (isrc === undefined || isrc === "") continue;
		const group = buckets.get(isrc);
		if (group !== undefined) group.push(t);
		else buckets.set(isrc, [t]);
	}

	const result: DuplicateGroup[] = [];
	for (const group of buckets.values()) {
		if (group.length < 2) continue;
		const verified: DuplicateGroup = [group[0]];
		for (let i = 1; i < group.length; i++) {
			if (sameArtist(group[0].track, group[i].track)) {
				verified.push(group[i]);
			}
		}
		if (verified.length >= 2) result.push(verified);
	}
	return result;
}

function groupByName(tracks: IndexedTrack[]): DuplicateGroup[] {
	const trackKey = (t: TrackItem): string => {
		const title = normalize(fullTitle(t.item));
		const artist = t.item.artists.length > 0 ? normalize(t.item.artists[0].name) : "";
		return `${title}|${artist}`;
	};

	const buckets = new Map<string, DuplicateGroup>();
	for (const t of tracks) {
		const key = trackKey(t.track);
		const group = buckets.get(key);
		if (group !== undefined) group.push(t);
		else buckets.set(key, [t]);
	}

	return [...buckets.values()].filter((g) => g.length >= 2);
}

const REMASTER_PATTERNS = [
	// (Remastered), (Remastered 2015), [Remastered 2015], (2015 Remaster), [2015 Remaster]
	/[\(\[]\s*remaster(?:ed)?\s*(?:\d{4})?\s*[\)\]]/i,
	/[\(\[]\s*\d{4}\s+remaster(?:ed)?\s*[\)\]]/i,
	// (Deluxe Remastered), (Deluxe Edition Remastered)
	/[\(\[].*remaster(?:ed)?.*[\)\]]/i,
	// - Remastered, - Remastered 2015, - 2015 Remaster
	/\s-\s+remaster(?:ed)?\s*(?:\d{4})?$/i,
	/\s-\s+\d{4}\s+remaster(?:ed)?$/i,
];

export function stripRemasterTags(title: string): string {
	let result = title;
	for (const pattern of REMASTER_PATTERNS) {
		result = result.replace(pattern, "");
	}
	return result.trim();
}

function isRemasterVersion(version?: string): boolean {
	if (!version) return false;
	return /remaster(?:ed)?/i.test(version);
}

export function isRemastered(title: string, version?: string): boolean {
	if (isRemasterVersion(version)) return true;
	return REMASTER_PATTERNS.some((p) => p.test(title));
}

function groupByRemaster(tracks: IndexedTrack[]): DuplicateGroup[] {
	const trackKey = (t: TrackItem): string => {
		const title = normalize(stripRemasterTags(t.item.title));
		// If version is a remaster tag, exclude it from key; otherwise include it
		const version = t.item.version && !isRemasterVersion(t.item.version) ? normalize(t.item.version) : "";
		const artist = t.item.artists.length > 0 ? normalize(t.item.artists[0].name) : "";
		return `${title}|${version}|${artist}`;
	};

	const buckets = new Map<string, DuplicateGroup>();
	for (const t of tracks) {
		const key = trackKey(t.track);
		const group = buckets.get(key);
		if (group !== undefined) group.push(t);
		else buckets.set(key, [t]);
	}

	const result: DuplicateGroup[] = [];
	for (const group of buckets.values()) {
		if (group.length < 2) continue;
		// Only include groups where at least one track has a remaster tag
		const hasRemaster = group.some((t) => isRemastered(t.track.item.title, t.track.item.version));
		if (!hasRemaster) continue;

		// Verify artist overlap between tracks
		const verified: DuplicateGroup = [group[0]];
		for (let i = 1; i < group.length; i++) {
			if (sameArtist(group[0].track, group[i].track)) {
				verified.push(group[i]);
			}
		}
		if (verified.length >= 2) result.push(verified);
	}
	return result;
}

const STRATEGY_MAP: Record<string, (tracks: IndexedTrack[]) => DuplicateGroup[]> = {
	id: groupById,
	isrc: groupByIsrc,
	name: groupByName,
	remaster: groupByRemaster,
};

export function findDuplicates(tracks: IndexedTrack[], strategies: string[]): DuplicateGroup[] {
	if (strategies.length === 0) strategies = ["name"];

	const seenGroups = new Set<string>();
	const result: DuplicateGroup[] = [];

	for (const strategyName of strategies) {
		const func = STRATEGY_MAP[strategyName] ?? STRATEGY_MAP["id"];
		for (const group of func(tracks)) {
			const key = group
				.map((t) => t.index)
				.sort((a, b) => a - b)
				.join(",");
			if (!seenGroups.has(key)) {
				seenGroups.add(key);
				result.push(group);
			}
		}
	}

	return result;
}
