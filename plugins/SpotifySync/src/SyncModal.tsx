import React, { useState, useEffect } from "react";

import type { SyncPrepResult, SyncPlaylistResult, SimilarVersion, TrackToRemove } from "./sync";

function formatDuration(seconds: number): string {
	const m = Math.floor(seconds / 60);
	const s = Math.floor(seconds % 60);
	return `${m}:${s.toString().padStart(2, "0")}`;
}

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
	// Checkbox state: key = `${playlistName}:new:${tidalId}` or `${playlistName}:existing:${tidalId}` → boolean
	const [checked, setChecked] = useState<Map<string, boolean>>(new Map());

	useEffect(() => {
		if (phase === "confirm") {
			const initial = new Map<string, boolean>();
			for (const prep of prepResults) {
				for (const track of prep.tracksToAdd) {
					if (track.similarExisting && track.similarExisting.length > 0) {
						// For similar groups: existing tracks checked, new track unchecked
						initial.set(`${prep.playlistName}:new:${track.tidalId}`, false);
						for (const sim of track.similarExisting) {
							initial.set(`${prep.playlistName}:existing:${sim.tidalId}`, true);
						}
					} else {
						// Regular tracks: checked by default
						initial.set(`${prep.playlistName}:new:${track.tidalId}`, true);
					}
				}
			}
			setChecked(initial);
		}
	}, [phase]);

	const toggleItem = (key: string) => {
		setChecked((prev) => {
			const next = new Map(prev);
			next.set(key, !prev.get(key));
			return next;
		});
	};

	const toggleAllNew = (playlistName: string, tracks: { tidalId: number; similarExisting?: SimilarVersion[] }[]) => {
		setChecked((prev) => {
			const next = new Map(prev);
			const newTracks = tracks.filter((t) => !t.similarExisting || t.similarExisting.length === 0);
			const allChecked = newTracks.every((t) => prev.get(`${playlistName}:new:${t.tidalId}`));
			for (const t of newTracks) {
				next.set(`${playlistName}:new:${t.tidalId}`, !allChecked);
			}
			return next;
		});
	};

	const handleConfirm = () => {
		const filtered = prepResults.map((prep) => {
			const tracksToAdd = prep.tracksToAdd.filter((t) => checked.get(`${prep.playlistName}:new:${t.tidalId}`));
			const tracksToRemove: TrackToRemove[] = [];
			for (const track of prep.tracksToAdd) {
				if (!track.similarExisting) continue;
				for (const sim of track.similarExisting) {
					if (!checked.get(`${prep.playlistName}:existing:${sim.tidalId}`)) {
						tracksToRemove.push({
							tidalId: sim.tidalId,
							playlistIndex: sim.playlistIndex,
							description: sim.description,
						});
					}
				}
			}
			return { ...prep, tracksToAdd, tracksToRemove };
		});
		onConfirm(filtered);
	};

	const totalNewChecked = prepResults.reduce((sum, prep) => {
		return sum + prep.tracksToAdd.filter((t) => checked.get(`${prep.playlistName}:new:${t.tidalId}`)).length;
	}, 0);
	const totalExistingUnchecked = prepResults.reduce((sum, prep) => {
		let count = 0;
		for (const track of prep.tracksToAdd) {
			if (!track.similarExisting) continue;
			for (const sim of track.similarExisting) {
				if (!checked.get(`${prep.playlistName}:existing:${sim.tidalId}`)) count++;
			}
		}
		return sum + count;
	}, 0);
	const hasChanges = totalNewChecked > 0 || totalExistingUnchecked > 0;

	// Complete phase totals
	const totalMatched = results.reduce((sum, r) => sum + r.matched, 0);
	const totalAdded = results.reduce((sum, r) => sum + r.added, 0);
	const totalRemoved = results.reduce((sum, r) => sum + r.removed, 0);
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
							const similarTracks = prep.tracksToAdd.filter((t) => t.similarExisting && t.similarExisting.length > 0);
							const regularTracks = prep.tracksToAdd.filter((t) => !t.similarExisting || t.similarExisting.length === 0);

							return (
								<div key={i} style={{ marginBottom: "16px" }}>
									<h3 style={{ fontSize: "15px", color: "#fff", margin: "0 0 4px 0" }}>
										{prep.playlistName}
									</h3>
									<div style={{ color: "rgba(255,255,255,0.6)", fontSize: "13px", marginBottom: "6px" }}>
										Matched: {prep.matched} | Already present: {prep.alreadyPresent} | Not found: {prep.unmatched}
									</div>

									{/* Similar version groups */}
									{similarTracks.length > 0 && (
										<div style={{ marginBottom: "8px" }}>
											<div style={{ color: "rgba(255,200,100,0.8)", fontSize: "13px", marginBottom: "4px" }}>
												{similarTracks.length} track{similarTracks.length !== 1 ? "s" : ""} with similar versions:
											</div>
											{similarTracks.map((track) => (
												<div
													key={track.tidalId}
													style={{
														marginBottom: "8px",
														border: "1px solid rgba(255,255,255,0.08)",
														borderRadius: "6px",
														background: "rgba(255,255,255,0.03)",
													}}
												>
													{/* Existing versions */}
													{track.similarExisting!.map((sim) => {
														const key = `${prep.playlistName}:existing:${sim.tidalId}`;
														const isChecked = checked.get(key) ?? true;
														return (
															<label
																key={sim.tidalId}
																style={{
																	display: "flex",
																	alignItems: "center",
																	gap: "10px",
																	padding: "6px 12px",
																	cursor: "pointer",
																	userSelect: "none",
																	borderBottom: "1px solid rgba(255,255,255,0.05)",
																	background: isChecked ? "rgba(80,200,120,0.08)" : "rgba(255,80,80,0.08)",
																}}
															>
																<input
																	type="checkbox"
																	checked={isChecked}
																	onChange={() => toggleItem(key)}
																	style={{ flexShrink: 0 }}
																/>
																<div style={{ flex: 1, minWidth: 0 }}>
																	<div style={{ fontSize: "12px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "rgba(255,255,255,0.7)" }}>
																		{sim.description}
																	</div>
																</div>
																<span style={{ padding: "1px 6px", borderRadius: "3px", fontSize: "10px", background: "rgba(100,200,255,0.15)", color: "rgba(100,200,255,0.8)", flexShrink: 0 }}>
																	Existing
																</span>
																<span style={{ color: "rgba(255,255,255,0.4)", fontSize: "11px", flexShrink: 0 }}>
																	{formatDuration(sim.duration)}
																</span>
															</label>
														);
													})}
													{/* New track */}
													{(() => {
														const key = `${prep.playlistName}:new:${track.tidalId}`;
														const isChecked = checked.get(key) ?? false;
														return (
															<label
																style={{
																	display: "flex",
																	alignItems: "center",
																	gap: "10px",
																	padding: "6px 12px",
																	cursor: "pointer",
																	userSelect: "none",
																	background: isChecked ? "rgba(80,200,120,0.08)" : "rgba(255,80,80,0.08)",
																}}
															>
																<input
																	type="checkbox"
																	checked={isChecked}
																	onChange={() => toggleItem(key)}
																	style={{ flexShrink: 0 }}
																/>
																<div style={{ flex: 1, minWidth: 0 }}>
																	<div style={{ fontSize: "12px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "rgba(255,255,255,0.7)" }}>
																		{track.description}
																	</div>
																</div>
																<span style={{ padding: "1px 6px", borderRadius: "3px", fontSize: "10px", background: "rgba(29,185,84,0.15)", color: "rgba(29,185,84,0.8)", flexShrink: 0 }}>
																	New
																</span>
																<span style={{ color: "rgba(255,255,255,0.4)", fontSize: "11px", flexShrink: 0 }}>
																	{formatDuration(track.duration)}
																</span>
															</label>
														);
													})()}
												</div>
											))}
										</div>
									)}

									{/* Regular tracks (no similar versions) */}
									{regularTracks.length > 0 && (
										<div style={{ marginBottom: "4px" }}>
											<span
												onClick={() => toggleAllNew(prep.playlistName, regularTracks)}
												style={{
													color: "rgba(29,185,84,0.8)",
													fontSize: "13px",
													cursor: "pointer",
													userSelect: "none",
												}}
											>
												{regularTracks.every((t) => checked.get(`${prep.playlistName}:new:${t.tidalId}`)) ? "Deselect all" : "Select all"} ({regularTracks.filter((t) => checked.get(`${prep.playlistName}:new:${t.tidalId}`)).length}/{regularTracks.length})
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
												{regularTracks.map((track) => {
													const key = `${prep.playlistName}:new:${track.tidalId}`;
													const isChecked = checked.get(key) ?? false;
													return (
														<label
															key={track.tidalId}
															style={{
																display: "flex",
																alignItems: "center",
																padding: "4px 8px",
																cursor: "pointer",
																borderBottom: "1px solid rgba(255,255,255,0.04)",
																background: isChecked ? "rgba(29,185,84,0.05)" : "transparent",
															}}
														>
															<input
																type="checkbox"
																checked={isChecked}
																onChange={() => toggleItem(key)}
																style={{ marginRight: "8px", flexShrink: 0 }}
															/>
															<span style={{ color: "rgba(255,255,255,0.7)", fontSize: "12px" }}>
																{track.description}
															</span>
														</label>
													);
												})}
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
									Matched: {result.matched} | Added: {result.added}{result.removed > 0 ? ` | Removed: ${result.removed}` : ""} | Already present: {result.alreadyPresent} | Not found: {result.unmatched}
								</div>
								<TrackList
									label={`added track${result.addedTracks.length !== 1 ? "s" : ""}`}
									tracks={result.addedTracks}
									color="rgba(29,185,84,0.8)"
								/>
								<TrackList
									label={`removed track${result.removedTracks.length !== 1 ? "s" : ""}`}
									tracks={result.removedTracks}
									color="rgba(255,100,100,0.8)"
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
							Total: {totalMatched} matched, {totalAdded} added{totalRemoved > 0 ? `, ${totalRemoved} removed` : ""}, {totalUnmatched} not found
						</span>
					)}
					{phase === "confirm" && (
						<span style={{ color: "rgba(255,255,255,0.5)", fontSize: "13px" }}>
							{totalNewChecked} to add{totalExistingUnchecked > 0 ? `, ${totalExistingUnchecked} to remove` : ""}
						</span>
					)}
					<div style={{ display: "flex", gap: "8px", marginLeft: "auto" }}>
						{phase === "confirm" && (
							<button
								onClick={handleConfirm}
								disabled={!hasChanges}
								style={{
									padding: "8px 20px",
									borderRadius: "4px",
									border: "none",
									background: hasChanges ? "#1db954" : "rgba(255,255,255,0.1)",
									color: "#fff",
									cursor: hasChanges ? "pointer" : "not-allowed",
									fontSize: "13px",
									fontWeight: 500,
								}}
							>
								Confirm ({totalNewChecked} add{totalExistingUnchecked > 0 ? `, ${totalExistingUnchecked} remove` : ""})
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
