import type { DuplicateGroup, IndexedTrack } from "./detection";
import { findDuplicates } from "./detection";
import { resolveDuplicates } from "./resolution";
import { getActiveStrategies, keepStrategy } from "./state";
import {
	fetchFavoriteTracks,
	fetchPlaylistItems,
	fetchStreamInfo,
	removeFromFavorites,
	removeFromPlaylist,
	updateReduxAfterRemoval,
	type StreamInfo,
} from "./tidalApi";

export interface SelectedTarget {
	type: "playlist" | "favorites";
	uuid: string;
	title: string;
}

export interface TrackChoice {
	index: number;
	track: IndexedTrack;
	keep: boolean;
	streamInfo?: StreamInfo | null;
}

export interface DuplicateGroupResult {
	choices: TrackChoice[];
}

export interface PlaylistScanResult {
	target: SelectedTarget;
	groups: DuplicateGroupResult[];
	indexed: IndexedTrack[];
}

function buildGroupResult(group: DuplicateGroup): DuplicateGroupResult {
	const { keepIndex } = resolveDuplicates(group, keepStrategy);
	return {
		choices: group.map((t) => ({
			index: t.index,
			track: t,
			keep: t.index === keepIndex,
		})),
	};
}

function groupNeedsStreamInfo(group: DuplicateGroupResult): boolean {
	const qualities = new Set(group.choices.map((c) => c.track.track.item.audioQuality ?? ""));
	return qualities.size === 1;
}

async function enrichAllWithStreamInfo(
	groups: DuplicateGroupResult[],
	onProgress: (done: number, total: number) => void,
): Promise<void> {
	const choices: TrackChoice[] = [];
	for (const group of groups) {
		for (const choice of group.choices) {
			choices.push(choice);
		}
	}

	let done = 0;
	let running = 0;
	const maxConcurrency = 10;
	let idx = 0;
	onProgress(0, choices.length);

	await new Promise<void>((resolve, reject) => {
		const launch = () => {
			while (running < maxConcurrency && idx < choices.length) {
				const choice = choices[idx++];
				running++;
				const t = choice.track.track.item;
				fetchStreamInfo(t.id, t.audioQuality ?? "LOSSLESS")
					.then((info) => { choice.streamInfo = info; })
					.catch(() => { choice.streamInfo = null; })
					.finally(() => {
						running--;
						done++;
						onProgress(done, choices.length);
						if (done === choices.length) resolve();
						else launch();
					});
			}
		};
		if (choices.length === 0) resolve();
		else launch();
	});
}

export async function scanForDuplicates(
	targets: SelectedTarget[],
	onStatus: (msg: string) => void,
): Promise<PlaylistScanResult[]> {
	const strategies = getActiveStrategies();
	if (strategies.length === 0) throw new Error("Enable at least one detection strategy.");

	const results: PlaylistScanResult[] = [];

	for (const target of targets) {
		onStatus(`Fetching "${target.title}"...`);
		const items = target.type === "favorites"
			? await fetchFavoriteTracks((loaded, total) => onStatus(`Fetching "${target.title}": ${loaded}/${total} tracks...`))
			: await fetchPlaylistItems(target.uuid);
		onStatus(`Fetched ${items.length} tracks from "${target.title}", scanning for duplicates...`);

		const indexed: IndexedTrack[] = items.map((item, index) => ({ index, track: item }));
		const duplicateGroups = findDuplicates(indexed, strategies);
		onStatus(`Found ${duplicateGroups.length} duplicate group(s) in "${target.title}"`);

		if (duplicateGroups.length > 0) {
			const groups = duplicateGroups.map(buildGroupResult);

			// Fetch stream info for groups where all tracks share the same quality tier
			const groupsNeedingInfo = groups.filter(groupNeedsStreamInfo);
			if (groupsNeedingInfo.length > 0) {
				await enrichAllWithStreamInfo(groupsNeedingInfo, (done, total) => {
					onStatus(`Fetching stream quality: ${done}/${total} tracks...`);
				});
			}

			results.push({ target, groups, indexed });
		}
	}

	return results;
}

export async function executeRemovals(
	results: PlaylistScanResult[],
	onStatus: (msg: string) => void,
): Promise<string> {
	let totalRemoved = 0;

	for (const { target, groups, indexed } of results) {
		const removeIndices: number[] = [];
		for (const group of groups) {
			for (const choice of group.choices) {
				if (!choice.keep) removeIndices.push(choice.index);
			}
		}
		if (removeIndices.length === 0) continue;

		removeIndices.sort((a, b) => a - b);
		onStatus(`Removing ${removeIndices.length} tracks from "${target.title}"...`);

		if (target.type === "favorites") {
			const trackMap = new Map(indexed.map((t) => [t.index, t]));
			const trackIds = removeIndices.map((idx) => trackMap.get(idx)!.track.item.id);
			const success = await removeFromFavorites(trackIds, (removed, total) => {
				onStatus(`Removing from "${target.title}": ${removed}/${total}`);
			});
			if (!success) return `Failed to remove tracks from "${target.title}".`;
		} else {
			const success = await removeFromPlaylist(target.uuid, removeIndices);
			if (!success) return `Failed to remove tracks from "${target.title}".`;
			updateReduxAfterRemoval(target.uuid, removeIndices);
		}

		totalRemoved += removeIndices.length;
	}

	if (totalRemoved === 0) return "Nothing to remove.";
	return `Removed ${totalRemoved} duplicate track(s).`;
}
