import type { LunaUnload } from "@luna/core";

import { scrollToPlayingTrack } from "./scrollToTrack";

export function setupScrollButton(unloads: Set<LunaUnload>): void {
	const button = document.createElement("button");
	button.className = "scroll-to-playing-btn";
	button.title = "Scroll to playing track";
	button.textContent = "🎵";
	button.addEventListener("click", scrollToPlayingTrack);
	document.body.appendChild(button);

	unloads.add(() => {
		button.removeEventListener("click", scrollToPlayingTrack);
		button.remove();
	});
}
