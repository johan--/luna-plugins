import type { LunaUnload } from "@luna/core";
import { Tracer } from "@luna/core";

import { runDiagnostics } from "./diagnostics";
import { scrollToPlayingTrack } from "./scrollToTrack";

const { trace } = Tracer("[ScrollToPlaying]");

function onClick(): void {
	runDiagnostics();
	scrollToPlayingTrack();
}

export function setupScrollButton(unloads: Set<LunaUnload>): void {
	const button = document.createElement("button");
	button.className = "scroll-to-playing-btn";
	button.title = "Scroll to playing track";
	button.textContent = "\u{1F3B5}";

	// Apply critical styles inline as fallback in case StyleTag doesn't work
	Object.assign(button.style, {
		position: "fixed",
		bottom: "100px",
		right: "20px",
		zIndex: "2147483647",
		width: "40px",
		height: "40px",
		borderRadius: "50%",
		border: "none",
		background: "rgba(255, 255, 255, 0.15)",
		color: "#fff",
		fontSize: "18px",
		cursor: "pointer",
		display: "flex",
		alignItems: "center",
		justifyContent: "center",
	});

	button.addEventListener("click", onClick);
	document.body.appendChild(button);

	trace.log(`Scroll button appended to body, visible=${button.offsetWidth > 0}`);

	unloads.add(() => {
		button.removeEventListener("click", onClick);
		button.remove();
	});
}
