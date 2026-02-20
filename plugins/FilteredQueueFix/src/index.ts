import type { LunaUnload } from "@luna/core";

import { setupFilterObserver } from "./filterState";
import { setupQueueIntercepts } from "./queueIntercept";

export const unloads = new Set<LunaUnload>();

setupFilterObserver(unloads);
setupQueueIntercepts(unloads);
