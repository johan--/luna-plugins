import type { LunaUnload } from "@luna/core";
import { StyleTag } from "@luna/lib";

export function setupStyles(unloads: Set<LunaUnload>): void {
	new StyleTag(
		"playlist-indicator",
		unloads,
		`
.playlist-indicator-check {
	color: #1db954;
	font-size: 0.85em;
	margin-left: 6px;
	font-weight: bold;
}
.playlist-indicator-remove-btn {
	color: #e74c3c !important;
	border-color: #e74c3c !important;
}
`,
	);
}
