/** Paper-lesson policy and assessment evidence. Browser-safe and version-additive. */
import type { LhMessage } from "./native-messages.ts";

export type TeachingStyle = "paper" | "guided";
export interface TeachingPreferences {
	style?: TeachingStyle;
	calibration?: number;
	checkpoints?: number;
	predictions?: boolean;
	repairRetries?: number;
}
export type ResolvedTeachingPreferences = Required<TeachingPreferences>;
export const PAPER_TEACHING_DEFAULTS: ResolvedTeachingPreferences = Object.freeze({
	style: "paper", calibration: 2, checkpoints: 6, predictions: false, repairRetries: 1,
});
export function sanitizeTeachingPreferences(raw: unknown): TeachingPreferences {
	if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
	const r = raw as Record<string, unknown>;
	const out: TeachingPreferences = {};
	if (r.style === "paper" || r.style === "guided") out.style = r.style;
	if (typeof r.predictions === "boolean") out.predictions = r.predictions;
	for (const [key, max] of [["calibration", 2], ["checkpoints", 12], ["repairRetries", 2]] as const) {
		const v = r[key];
		if (typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= max) out[key] = v;
	}
	return out;
}
export function parseTeachingPreferences(raw: unknown): { ok: true; settings: TeachingPreferences } | { ok: false; error: string } {
	if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, error: "teaching must be an object" };
	const settings = sanitizeTeachingPreferences(raw);
	for (const key of ["style", "calibration", "checkpoints", "predictions", "repairRetries"]) {
		if (key in raw && !(key in settings)) return { ok: false, error: `Invalid teaching.${key}` };
	}
	return { ok: true, settings };
}
export function resolveTeachingPreferences(raw?: TeachingPreferences): ResolvedTeachingPreferences {
	return { ...PAPER_TEACHING_DEFAULTS, ...sanitizeTeachingPreferences(raw) };
}

export const ASSESSMENT_STATES = ["unassessed", "untaught", "skipped", "invalidated", "needs-practice", "demonstrated"] as const;
export type AssessmentState = typeof ASSESSMENT_STATES[number];
export interface AssessmentReview { questionId: string; state: AssessmentState; reason: string }
/** Reviews are append-only transcript events; old answers remain auditable. */
export function assessmentReviews(messages: readonly LhMessage[]): Map<string, AssessmentReview> {
	const reviews = new Map<string, AssessmentReview>();
	for (const m of messages) {
		if (m.role !== "toolResult" || m.toolName !== "assessment_review" || m.isError) continue;
		const r = m.details as Partial<AssessmentReview> | undefined;
		if (typeof r?.questionId === "string" && typeof r.reason === "string" && ASSESSMENT_STATES.includes(r.state as AssessmentState)) reviews.set(r.questionId, r as AssessmentReview);
	}
	return reviews;
}
export function assessmentInstruction(messages: readonly LhMessage[]): string {
	const reviews = [...assessmentReviews(messages).values()];
	return reviews.length ? `Assessment evidence overrides (latest reviews; never infer misunderstanding from invalidated, untaught or skipped items):\n${JSON.stringify(reviews)}` : "";
}

/** Deterministic admission guard; grounding matches presented prose, not hidden keys. */
export function paperQuestionProblems(input: {
	name: string; questionId?: string; args: Record<string, unknown>; messages: readonly LhMessage[];
	preferences: ResolvedTeachingPreferences;
}): string[] {
	const { name, args, messages, preferences: p } = input;
	if (p.style !== "paper") return [];
	const probe = name === "probe" || name === "recall";
	const names = probe ? ["probe", "recall"] : ["quiz", "explain"];
	const failed = new Set(messages.filter(m => m.role === "toolResult" && m.isError).map(m => m.role === "toolResult" ? m.toolCallId : ""));
	const reviews = assessmentReviews(messages);
	const calls = messages.flatMap(m => m.role === "assistant" ? m.content.filter(b => b.type === "toolCall" && names.includes(b.name) && !failed.has(b.id)).map(b => b as { id: string; arguments: Record<string, unknown> }) : []);
	// The current call may already be in the SDK's history; count only resolved questions.
	const resolved = new Set(messages.filter(m => m.role === "toolResult" && !m.isError && m.details !== null).map(m => m.role === "toolResult" ? m.toolCallId : ""));
	const prior = calls.filter(c => resolved.has(c.id) && !messages.some(m => m.role === "toolResult" && m.toolCallId === c.id && ["untaught", "skipped", "invalidated"].includes((m.details as { assessmentState?: string })?.assessmentState ?? "")) && !["invalidated", "untaught", "skipped"].includes(reviews.get(c.id)?.state ?? ""));
	if (prior.length >= (probe ? p.calibration : p.checkpoints)) return [probe ? "Calibration budget reached. Explain missing prerequisites and call probe_done." : "Checkpoint budget reached. Continue teaching through lesson_progress without another graded question."];
	if (!probe && args.type === "predict" && !p.predictions) return ["Predictions are disabled. Explain the next concept directly."];
	if (probe) {
		if (args.prerequisiteOnly !== true) return ["Calibration must test prerequisites only; set prerequisiteOnly after checking this is not an untaught paper-specific fact."];
	} else {
		const grounding = args.grounding as { taughtExcerpt?: unknown; source?: unknown; answerKeyChecked?: unknown } | undefined;
		if (typeof grounding?.taughtExcerpt !== "string" || grounding.taughtExcerpt.trim().length < 20 || typeof grounding.source !== "string" || !grounding.source.trim() || grounding.answerKeyChecked !== true) return ["Supply grounding: an exact taughtExcerpt (20+ characters), a source citation, and answerKeyChecked:true. Explain first."];
		const presented: string[] = [];
		let reachedQuestion = false;
		for (const message of messages) {
			if (message.role !== "assistant") continue;
			for (const block of message.content) {
				if (block.type === "toolCall" && block.id === input.questionId) { reachedQuestion = true; break; }
				if (block.type === "text") presented.push(block.text);
				if (block.type === "toolCall" && block.name === "send_to_user") presented.push(String((block.arguments as { message?: unknown }).message ?? ""));
			}
			if (reachedQuestion) break;
		}
		const prose = presented.join("\n");
		if (!prose.includes(grounding.taughtExcerpt.trim())) return ["The grounding excerpt is absent from presented teaching. Teach the required facts before asking the check."];
		const sameNode = prior.filter(c => c.arguments.nodeId === args.nodeId);
		if (sameNode.length > p.repairRetries) return ["Repair retry limit reached for this section. Explain directly, mark needs-practice and continue."];
		if (sameNode.some(c => messages.some(m => m.role === "toolResult" && m.toolCallId === c.id && (m.details as { correct?: boolean })?.correct === true))) return ["This section already has a successful check. Continue with a substantial explanation instead of repeating it."];
	}
	return [];
}
