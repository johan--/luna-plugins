import type { LunaUnload } from "@luna/core";

import { setupContextMenuHandler } from "./contextMenuHandler";
import { setupCache } from "./playlistCache";
import { setupStyles } from "./styles";

export const unloads = new Set<LunaUnload>();

setupStyles(unloads);
setupCache(unloads);
setupContextMenuHandler(unloads);
