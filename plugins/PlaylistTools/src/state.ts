const STORAGE_PREFIX = "dedupPlaylist:";

export type KeepStrategy = "best-quality" | "oldest" | "newest";

export let byId = localStorage.getItem(`${STORAGE_PREFIX}byId`) === "true";
export let byIsrc = localStorage.getItem(`${STORAGE_PREFIX}byIsrc`) === "true";
export let byName = localStorage.getItem(`${STORAGE_PREFIX}byName`) !== "false";
export let byRemaster = localStorage.getItem(`${STORAGE_PREFIX}byRemaster`) === "true";
export let keepStrategy: KeepStrategy = (localStorage.getItem(`${STORAGE_PREFIX}keepStrategy`) as KeepStrategy) ?? "best-quality";

export function setById(enabled: boolean): void {
	byId = enabled;
	localStorage.setItem(`${STORAGE_PREFIX}byId`, String(enabled));
}

export function setByIsrc(enabled: boolean): void {
	byIsrc = enabled;
	localStorage.setItem(`${STORAGE_PREFIX}byIsrc`, String(enabled));
}

export function setByName(enabled: boolean): void {
	byName = enabled;
	localStorage.setItem(`${STORAGE_PREFIX}byName`, String(enabled));
}

export function setByRemaster(enabled: boolean): void {
	byRemaster = enabled;
	localStorage.setItem(`${STORAGE_PREFIX}byRemaster`, String(enabled));
}

export function setKeepStrategy(strategy: KeepStrategy): void {
	keepStrategy = strategy;
	localStorage.setItem(`${STORAGE_PREFIX}keepStrategy`, strategy);
}

export type ScanMode = "dedup" | "upgrade";

export let scanMode: ScanMode = (localStorage.getItem(`${STORAGE_PREFIX}scanMode`) as ScanMode) ?? "dedup";

export function setScanMode(mode: ScanMode): void {
	scanMode = mode;
	localStorage.setItem(`${STORAGE_PREFIX}scanMode`, mode);
}

export function getActiveStrategies(): string[] {
	const strategies: string[] = [];
	if (byId) strategies.push("id");
	if (byIsrc) strategies.push("isrc");
	if (byName) strategies.push("name");
	if (byRemaster) strategies.push("remaster");
	return strategies;
}
