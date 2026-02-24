import type { LunaUnload } from "@luna/core";
import { StyleTag } from "@luna/lib";

export function setupStyles(unloads: Set<LunaUnload>): void {
	new StyleTag(
		"scroll-to-playing",
		unloads,
		`
.scroll-to-playing-btn {
	position: fixed;
	bottom: 100px;
	right: 20px;
	z-index: 9999;
	width: 40px;
	height: 40px;
	border-radius: 50%;
	border: none;
	background: rgba(255, 255, 255, 0.1);
	color: #fff;
	font-size: 18px;
	cursor: pointer;
	display: flex;
	align-items: center;
	justify-content: center;
	backdrop-filter: blur(10px);
	transition: background 0.2s, transform 0.2s;
}
.scroll-to-playing-btn:hover {
	background: rgba(255, 255, 255, 0.2);
	transform: scale(1.1);
}
.scroll-to-playing-btn:active {
	transform: scale(0.95);
}
`,
	);
}
