import type { LunaUnload } from "@luna/core";
import { Tracer } from "@luna/core";

const { trace } = Tracer("[ScrollToPlaying]");

import { setupConnectSync } from "./connectSync";
import { setupHighlight } from "./highlight";
import { setupScrollButton } from "./scrollButton";
import { setupStyles } from "./styles";

export { Settings } from "./Settings";

export const unloads = new Set<LunaUnload>();

try {
	setupStyles(unloads);
	setupHighlight(unloads);
	setupConnectSync(unloads);
	setupScrollButton(unloads);
	trace.log("ScrollToPlaying plugin loaded successfully");
} catch (err) {
	trace.err("Failed to initialize ScrollToPlaying:", err);
}
