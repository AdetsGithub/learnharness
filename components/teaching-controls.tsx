"use client";
import { useEffect, useState } from "react";
import { resolveTeachingPreferences, type TeachingPreferences } from "@/src/core";
import { Button } from "./ui/button";

export function TeachingControls({ value, disabled, onChange }: { value?: TeachingPreferences; disabled?: boolean; onChange: (value: TeachingPreferences) => void }) {
	const p = resolveTeachingPreferences(value);
	const selectClass = "rounded border border-border bg-background p-1.5 text-sm";
	return <fieldset disabled={disabled} className="flex flex-wrap items-end gap-3 text-sm" data-testid="teaching-controls">
		<label className="flex flex-col gap-1">Lesson style<select aria-label="Lesson style" className={selectClass} value={p.style} onChange={e => onChange({ ...p, style: e.target.value as "paper" | "guided" })}>
			<option value="paper">Paper · explanation first</option><option value="guided">Guided discovery</option>
		</select></label>
		{p.style === "paper" && <>
			<label className="flex flex-col gap-1">Prerequisite checks<select aria-label="Prerequisite checks" className={selectClass} value={p.calibration} onChange={e => onChange({ ...p, calibration: Number(e.target.value) })}>{[0, 1, 2].map(n => <option key={n} value={n}>{n === 0 ? "None" : `Up to ${n}`}</option>)}</select></label>
			<label className="flex flex-col gap-1">Lesson checks<select aria-label="Lesson checks" className={selectClass} value={p.checkpoints} onChange={e => onChange({ ...p, checkpoints: Number(e.target.value) })}>{[0, 4, 6, 8, 12, ...(![0, 4, 6, 8, 12].includes(p.checkpoints) ? [p.checkpoints] : [])].sort((a,b) => a-b).map(n => <option key={n} value={n}>{n === 0 ? "None · read and continue" : `Up to ${n}`}</option>)}</select></label>
			<label className="flex flex-col gap-1">Retries per section<select aria-label="Retries per section" className={selectClass} value={p.repairRetries} onChange={e => onChange({ ...p, repairRetries: Number(e.target.value) })}>{[0, 1, 2].map(n => <option key={n} value={n}>{n}</option>)}</select></label>
			<label className="flex items-center gap-2 p-1.5"><input type="checkbox" checked={p.predictions} onChange={e => onChange({ ...p, predictions: e.target.checked })} />Pre-teaching predictions</label>
		</>}
	</fieldset>;
}

export function SessionTeachingBar({ chatId, busy, canContinue, onContinue }: { chatId: string; busy: boolean; canContinue: boolean; onContinue: () => void }) {
	const [value, setValue] = useState<TeachingPreferences>();
	const [open, setOpen] = useState(false);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState("");
	useEffect(() => {
		const abort = new AbortController();
		void fetch(`/api/chats/${chatId}/teaching`, { signal: abort.signal }).then(r => r.ok ? r.json() : Promise.reject(new Error("Could not read lesson settings"))).then(d => setValue(d.teaching)).catch(e => { if (!abort.signal.aborted) setError(String(e)); });
		return () => abort.abort();
	}, [chatId]);
	async function save(next: TeachingPreferences) {
		setSaving(true); setError("");
		try {
			const r = await fetch(`/api/chats/${chatId}/teaching`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(next) });
			const d = await r.json(); if (!r.ok) throw new Error(d.error ?? "Could not save settings"); setValue(d.teaching);
		} catch (e) { setError(String(e)); } finally { setSaving(false); }
	}
	return <div className="shrink-0 border-b border-border bg-background px-6 py-2 font-ui" data-testid="paper-lesson-bar">
		<div className="flex flex-wrap items-center gap-3 text-xs">
			<span>{resolveTeachingPreferences(value).style === "paper" ? "Paper · explanation first" : "Guided discovery"}</span>
			<Button size="xs" variant="ghost" onClick={() => setOpen(v => !v)} aria-expanded={open}>Lesson settings</Button>
			{canContinue && <Button size="xs" variant="outline" onClick={onContinue} disabled={busy} data-testid="continue-reading">Continue reading</Button>}
		</div>
		{open && <div className="py-3"><TeachingControls value={value} disabled={busy || saving || !value} onChange={next => { void save(next); }} /><p className="mt-2 text-xs text-muted-foreground">Applies to this lesson. Counts are limits, not quotas. Use Practice from the home page for exercises.</p></div>}
		{error && <p role="alert" className="text-sm text-destructive">{error}</p>}
	</div>;
}
