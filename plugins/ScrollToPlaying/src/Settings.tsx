import React from "react";
import { LunaSettings, LunaSwitchSetting, LunaTextSetting, LunaNumberSetting } from "@luna/ui";

import { refreshHighlight } from "./highlight";
import { autoScrollEnabled, highlightColor, highlightOpacity, setAutoScroll, setHighlightColor, setHighlightOpacity } from "./state";

export const Settings = () => (
	<LunaSettings>
		<LunaSwitchSetting
			title="Auto-scroll on track change"
			desc="Automatically scroll the tracklist to the currently playing track when it changes"
			defaultChecked={autoScrollEnabled}
			onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAutoScroll(e.target.checked)}
		/>
		<LunaTextSetting
			title="Highlight color (R, G, B)"
			desc="RGB values for the highlight color, e.g. 126, 251, 238"
			defaultValue={highlightColor}
			onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
				setHighlightColor(e.target.value);
				refreshHighlight();
			}}
		/>
		<LunaNumberSetting
			title="Highlight opacity (%)"
			desc="Background opacity for the highlighted row (0-100)"
			defaultValue={highlightOpacity}
			min={0}
			max={100}
			onNumber={(value: number) => {
				setHighlightOpacity(value);
				refreshHighlight();
			}}
		/>
	</LunaSettings>
);
