import React from "react";
import { LunaSettings, LunaSwitchSetting } from "@luna/ui";

import { autoScrollEnabled, setAutoScroll } from "./state";

export const Settings = () => (
	<LunaSettings>
		<LunaSwitchSetting
			title="Auto-scroll on track change"
			desc="Automatically scroll the tracklist to the currently playing track when it changes"
			defaultChecked={autoScrollEnabled}
			onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAutoScroll(e.target.checked)}
		/>
	</LunaSettings>
);
