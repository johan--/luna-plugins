import React, { useState, useEffect } from "react";

import type { SyncPrepResult, SyncPlaylistResult } from "./sync";

// --- Reusable collapsible track list ---

const TrackList = ({ label, tracks, color }: { label: string; tracks: string[]; color: string }) => {
	const [open, setOpen] = useState(false);
	if (tracks.length === 0) return null;
	return (
		<div style={{ marginBottom: "2px" }}>
			<span
				onClick={() => setOpen(!open)}
				style={{ color, fontSize: "13px", cursor: "pointer", userSelect: "none" }}
			>
				{open ? "\u25BE" : "\u25B8"} {tracks.length} {label}
			</span>
			{open && (
				<ul style={{ margin: "4px 0 0 0", paddingLeft: "20px", maxHeight: "150px", overflowY: "auto" }}>
					{tracks.map((track, j) => (
						<li key={j} style={{ color: "rgba(255,255,255,0.5)", fontSize: "12px", marginBottom: "2px" }}>
							{track}
						</li>
					))}
				</ul>
			)}
		</div>
	);
};

// --- Main modal ---

export type ModalPhase = "progress" | "confirm" | "complete";

interface Props {
	phase: ModalPhase;
	progressMessage: string;
	prepResults: SyncPrepResult[];
	results: SyncPlaylistResult[];
	onConfirm: (filteredPreps: SyncPrepResult[]) => void;
	onClose: () => void;
	onCancel: () => void;
}

export const SyncModal = ({ phase, progressMessage, prepResults, results, onConfirm, onClose, onCancel }: Props) => {
	// Checkbox state: playlistName -> set of checked tidalIds
	const [checked, setChecked] = useState<Map<string, Set<number>>>(new Map());

	useEffect(() => {
		if (phase === "confirm") {
			const initial = new Map<string, Set<number>>();
			for (const prep of prepResults) {
				initial.set(prep.playlistName, new Set(prep.tracksToAdd.map((t) => t.tidalId)));
			}
			setChecked(initial);
		}
	}, [phase]);

	const toggleTrack = (playlistName: string, tidalId: number) => {
		setChecked((prev) => {
			const next = new Map(prev);
			const set = new Set(next.get(playlistName) ?? []);
			if (set.has(tidalId)) set.delete(tidalId);
			else set.add(tidalId);
			next.set(playlistName, set);
			return next;
		});
	};

	const toggleAllForPlaylist = (playlistName: string, tracks: { tidalId: number }[]) => {
		setChecked((prev) => {
			const next = new Map(prev);
			const current = next.get(playlistName) ?? new Set<number>();
			if (current.size === tracks.length) {
				next.set(playlistName, new Set());
			} else {
				next.set(playlistName, new Set(tracks.map((t) => t.tidalId)));
			}
			return next;
		});
	};

	const handleConfirm = () => {
		const filtered = prepResults.map((prep) => ({
			...prep,
			tracksToAdd: prep.tracksToAdd.filter((t) => checked.get(prep.playlistName)?.has(t.tidalId)),
		}));
		onConfirm(filtered);
	};

	const totalChecked = Array.from(checked.values()).reduce((sum, s) => sum + s.size, 0);

	// Complete phase totals
	const totalMatched = results.reduce((sum, r) => sum + r.matched, 0);
	const totalAdded = results.reduce((sum, r) => sum + r.added, 0);
	const totalUnmatched = results.reduce((sum, r) => sum + r.unmatched, 0);

	const isRunning = phase === "progress";
	const title = phase === "progress" ? "Syncing..." : phase === "confirm" ? "Review tracks to add" : "Sync Complete";

	return (
		<div
			style={{
				position: "fixed",
				inset: 0,
				zIndex: 999999,
				background: "rgba(0,0,0,0.85)",
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
			}}
			onClick={phase === "complete" ? onClose : undefined}
		>
			<div
				style={{
					background: "#1a1a2e",
					border: "1px solid rgba(255,255,255,0.15)",
					borderRadius: "8px",
					width: "min(700px, 90vw)",
					maxHeight: "80vh",
					display: "flex",
					flexDirection: "column",
					color: "#fff",
				}}
				onClick={(e) => e.stopPropagation()}
			>
				{/* Header */}
				<div style={{ padding: "16px 20px", borderBottom: "1px solid rgba(255,255,255,0.1)", flexShrink: 0 }}>
					<h2 style={{ margin: 0, fontSize: "18px", color: "#fff" }}>{title}</h2>
				</div>

				{/* Content */}
				<div style={{ overflowY: "auto", flex: 1, padding: "12px 20px" }}>
					{/* Progress phase */}
					{phase === "progress" && (
						<div style={{ color: "rgba(255,255,255,0.7)", fontSize: "14px" }}>{progressMessage}</div>
					)}

					{/* Confirm phase */}
					{phase === "confirm" &&
						prepResults.map((prep, i) => {
							const checkedSet = checked.get(prep.playlistName) ?? new Set<number>();
							return (
								<div key={i} style={{ marginBottom: "16px" }}>
									<h3 style={{ fontSize: "15px", color: "#fff", margin: "0 0 4px 0" }}>
										{prep.playlistName}
									</h3>
									<div style={{ color: "rgba(255,255,255,0.6)", fontSize: "13px", marginBottom: "6px" }}>
										Matched: {prep.matched} | Already present: {prep.alreadyPresent} | Not found: {prep.unmatched}
									</div>
									{prep.tracksToAdd.length > 0 && (
										<div style={{ marginBottom: "4px" }}>
											<span
												onClick={() => toggleAllForPlaylist(prep.playlistName, prep.tracksToAdd)}
												style={{
													color: "rgba(29,185,84,0.8)",
													fontSize: "13px",
													cursor: "pointer",
													userSelect: "none",
												}}
											>
												{checkedSet.size === prep.tracksToAdd.length ? "Deselect all" : "Select all"} ({checkedSet.size}/{prep.tracksToAdd.length})
											</span>
											<div
												style={{
													maxHeight: "200px",
													overflowY: "auto",
													marginTop: "4px",
													border: "1px solid rgba(255,255,255,0.08)",
													borderRadius: "4px",
												}}
											>
												{prep.tracksToAdd.map((track) => (
													<label
														key={track.tidalId}
														style={{
															display: "flex",
															alignItems: "center",
															padding: "4px 8px",
															cursor: "pointer",
															borderBottom: "1px solid rgba(255,255,255,0.04)",
															background: checkedSet.has(track.tidalId) ? "rgba(29,185,84,0.05)" : "transparent",
														}}
													>
														<input
															type="checkbox"
															checked={checkedSet.has(track.tidalId)}
															onChange={() => toggleTrack(prep.playlistName, track.tidalId)}
															style={{ marginRight: "8px" }}
														/>
														<span style={{ color: "rgba(255,255,255,0.7)", fontSize: "12px" }}>
															{track.description}
														</span>
													</label>
												))}
											</div>
										</div>
									)}
									{prep.tracksToAdd.length === 0 && (
										<div style={{ color: "rgba(255,255,255,0.4)", fontSize: "12px" }}>No new tracks to add</div>
									)}
									<TrackList
										label={`unmatched track${prep.unmatchedTracks.length !== 1 ? "s" : ""}`}
										tracks={prep.unmatchedTracks}
										color="rgba(255,200,100,0.8)"
									/>
								</div>
							);
						})}

					{/* Complete phase */}
					{phase === "complete" &&
						results.map((result, i) => (
							<div key={i} style={{ marginBottom: "16px" }}>
								<h3 style={{ fontSize: "15px", color: "#fff", margin: "0 0 4px 0" }}>
									{result.playlistName}
								</h3>
								<div style={{ color: "rgba(255,255,255,0.6)", fontSize: "13px", marginBottom: "6px" }}>
									Matched: {result.matched} | Added: {result.added} | Already present: {result.alreadyPresent} | Not found: {result.unmatched}
								</div>
								<TrackList
									label={`added track${result.addedTracks.length !== 1 ? "s" : ""}`}
									tracks={result.addedTracks}
									color="rgba(29,185,84,0.8)"
								/>
								<TrackList
									label={`unmatched track${result.unmatchedTracks.length !== 1 ? "s" : ""}`}
									tracks={result.unmatchedTracks}
									color="rgba(255,200,100,0.8)"
								/>
							</div>
						))}
				</div>

				{/* Footer */}
				<div
					style={{
						padding: "12px 20px",
						borderTop: "1px solid rgba(255,255,255,0.1)",
						display: "flex",
						justifyContent: "space-between",
						alignItems: "center",
						flexShrink: 0,
					}}
				>
					{phase === "complete" && (
						<span style={{ color: "rgba(255,255,255,0.5)", fontSize: "13px" }}>
							Total: {totalMatched} matched, {totalAdded} added, {totalUnmatched} not found
						</span>
					)}
					{phase === "confirm" && (
						<span style={{ color: "rgba(255,255,255,0.5)", fontSize: "13px" }}>
							{totalChecked} track{totalChecked !== 1 ? "s" : ""} selected
						</span>
					)}
					<div style={{ display: "flex", gap: "8px", marginLeft: "auto" }}>
						{phase === "confirm" && (
							<button
								onClick={handleConfirm}
								disabled={totalChecked === 0}
								style={{
									padding: "8px 20px",
									borderRadius: "4px",
									border: "none",
									background: totalChecked > 0 ? "#1db954" : "rgba(255,255,255,0.1)",
									color: "#fff",
									cursor: totalChecked > 0 ? "pointer" : "not-allowed",
									fontSize: "13px",
									fontWeight: 500,
								}}
							>
								Confirm ({totalChecked})
							</button>
						)}
						<button
							onClick={phase === "complete" ? onClose : onCancel}
							style={{
								padding: "8px 20px",
								borderRadius: "4px",
								border: isRunning || phase === "confirm" ? "1px solid rgba(255,100,100,0.4)" : "none",
								background: phase === "complete" ? "#1db954" : "transparent",
								color: phase === "complete" ? "#fff" : "rgba(255,100,100,0.8)",
								cursor: "pointer",
								fontSize: "13px",
								fontWeight: 500,
							}}
						>
							{phase === "complete" ? "Close" : "Cancel"}
						</button>
					</div>
				</div>
			</div>
		</div>
	);
};
