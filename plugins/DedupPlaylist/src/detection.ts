export interface TrackItem {
	item: {
		id: number;
		title: string;
		duration: number;
		isrc?: string;
		artists: { id: number; name: string }[];
		audioQuality?: string;
	};
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

function groupByName(tracks: IndexedTrack[], durationTolerance = 2): DuplicateGroup[] {
	const trackKey = (t: TrackItem): string => {
		const artist = t.item.artists.length > 0 ? normalize(t.item.artists[0].name) : "";
		return `${normalize(t.item.title)}|${artist}`;
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

		const clusters = new Map<number, DuplicateGroup>();
		for (const t of group) {
			let placed = false;
			for (const [anchorDur, cluster] of clusters) {
				if (Math.abs(t.track.item.duration - anchorDur) <= durationTolerance) {
					cluster.push(t);
					placed = true;
					break;
				}
			}
			if (!placed) {
				clusters.set(t.track.item.duration, [t]);
			}
		}

		for (const cluster of clusters.values()) {
			if (cluster.length >= 2) result.push(cluster);
		}
	}
	return result;
}

const STRATEGY_MAP: Record<string, (tracks: IndexedTrack[]) => DuplicateGroup[]> = {
	id: groupById,
	isrc: groupByIsrc,
	name: groupByName,
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
