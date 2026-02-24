import type { LunaUnload } from "@luna/core";

import { setupConnectSync } from "./connectSync";
import { setupScrollButton } from "./scrollButton";
import { setupStyles } from "./styles";

export { Settings } from "./Settings";

export const unloads = new Set<LunaUnload>();

setupStyles(unloads);
setupConnectSync(unloads);
setupScrollButton(unloads);
