const STORAGE_PREFIX = "spotifySync:";

export let clientId = localStorage.getItem(`${STORAGE_PREFIX}clientId`) ?? "";
export let accessToken = localStorage.getItem(`${STORAGE_PREFIX}accessToken`) ?? "";
export let refreshToken = localStorage.getItem(`${STORAGE_PREFIX}refreshToken`) ?? "";
export let tokenExpiry = Number(localStorage.getItem(`${STORAGE_PREFIX}tokenExpiry`)) || 0;
export let codeVerifier = localStorage.getItem(`${STORAGE_PREFIX}codeVerifier`) ?? "";
export let syncFavorites = localStorage.getItem(`${STORAGE_PREFIX}syncFavorites`) === "true";
export let syncMode: "auto" | "manual" = (localStorage.getItem(`${STORAGE_PREFIX}syncMode`) as "auto" | "manual") || "auto";
export let skipSimilar = localStorage.getItem(`${STORAGE_PREFIX}skipSimilar`) !== "false";

export function setClientId(id: string): void {
	clientId = id;
	localStorage.setItem(`${STORAGE_PREFIX}clientId`, id);
}

export function setAccessToken(token: string): void {
	accessToken = token;
	localStorage.setItem(`${STORAGE_PREFIX}accessToken`, token);
}

export function setRefreshToken(token: string): void {
	refreshToken = token;
	localStorage.setItem(`${STORAGE_PREFIX}refreshToken`, token);
}

export function setTokenExpiry(expiry: number): void {
	tokenExpiry = expiry;
	localStorage.setItem(`${STORAGE_PREFIX}tokenExpiry`, String(expiry));
}

export function setCodeVerifier(verifier: string): void {
	codeVerifier = verifier;
	localStorage.setItem(`${STORAGE_PREFIX}codeVerifier`, verifier);
}

export function setSyncFavorites(enabled: boolean): void {
	syncFavorites = enabled;
	localStorage.setItem(`${STORAGE_PREFIX}syncFavorites`, String(enabled));
}

export function setSkipSimilar(skip: boolean): void {
	skipSimilar = skip;
	localStorage.setItem(`${STORAGE_PREFIX}skipSimilar`, String(skip));
}

export function setSyncMode(mode: "auto" | "manual"): void {
	syncMode = mode;
	localStorage.setItem(`${STORAGE_PREFIX}syncMode`, mode);
}

export function clearAuth(): void {
	setAccessToken("");
	setRefreshToken("");
	setTokenExpiry(0);
	setCodeVerifier("");
}

export function isLoggedIn(): boolean {
	return accessToken !== "" && Date.now() < tokenExpiry;
}
