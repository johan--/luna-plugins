import type { DuplicateGroup } from "./detection";

const QUALITY_RANK: Record<string, number> = {
	LOW: 0,
	HIGH: 1,
	LOSSLESS: 2,
	HI_RES_LOSSLESS: 3,
};

export interface ResolveResult {
	keepIndex: number;
	removeIndices: number[];
}

export function resolveDuplicates(group: DuplicateGroup, strategy: "best-quality" | "oldest" | "newest"): ResolveResult {
	let sorted: DuplicateGroup;

	if (strategy === "oldest") {
		sorted = [...group].sort((a, b) => a.index - b.index);
	} else if (strategy === "newest") {
		sorted = [...group].sort((a, b) => b.index - a.index);
	} else {
		// best-quality
		sorted = [...group].sort((a, b) => {
			const qualA = QUALITY_RANK[a.track.item.audioQuality ?? ""] ?? -1;
			const qualB = QUALITY_RANK[b.track.item.audioQuality ?? ""] ?? -1;
			if (qualB !== qualA) return qualB - qualA;
			// Tie-break: keep earlier occurrence
			return a.index - b.index;
		});
	}

	return {
		keepIndex: sorted[0].index,
		removeIndices: sorted.slice(1).map((t) => t.index).sort((a, b) => a - b),
	};
}
