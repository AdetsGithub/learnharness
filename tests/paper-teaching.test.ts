import { normalizePaperNotation } from "../src/core/math-delims.ts";
import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { createFauxCore, fauxAssistantMessage, fauxText, fauxToolCall } from "@earendil-works/pi-ai";
import { PAPER_TEACHING_DEFAULTS, paperQuestionProblems, resolveTeachingPreferences, parseTeachingPreferences, assessmentReviews, paperLessonStatus } from "../src/core/paper-teaching.ts";
import { sessionMarkdown } from "../src/core/session-markdown.ts";
import { phaseAt3Lh, phaseAt3 } from "../src/core/phases.ts";
import { derivePlanStatusesLh, derivePlanStatuses } from "../src/core/contracts/plan.ts";
import { projectView } from "../src/core/view.ts";
import type { LhMessage } from "../src/core/native-messages.ts";
import { composeInstructions, createTeacherAgent } from "../src/agent/teacher-agent.ts";
import { chatStore } from "../src/store/chats.ts";

const excerpt = "Extremum feedback records a new observed minimum or maximum, even inside a previously seen range.";
function prose(text = excerpt): LhMessage { return { role: "assistant", id: "teaching", content: [{ type: "text", text }], timestamp: 1 } as never; }
function call(name: string, args: unknown, id = name): LhMessage { return { role: "assistant", id: `msg-${id}`, content: [{ type: "toolCall", name, arguments: args, id }], timestamp: 2 } as never; }
function result(name: string, details: unknown, id = name): LhMessage { return { role: "toolResult", id: `result-${id}`, toolName: name, toolCallId: id, details, content: [{ type: "text", text: JSON.stringify(details) }], timestamp: 3, isError: false } as never; }
function optIn(): LhMessage { return { role: "user", content: "Check my understanding", timestamp: 0 } as never; }
const question = { question: "A new value 11 remains in a familiar range; the old maximum was 10. Which signal is new?", nodeId: "extrema", type: "check", options: [{ label: "Extremum", value: "e" }, { label: "No signal", value: "n" }], correctAnswer: "e", explanation: "11 exceeds 10.", grounding: { taughtExcerpt: excerpt, source: "StateFuzz §3.4.1", answerKeyChecked: true } };
const tree = { nodes: [{ id: "overview", title: "Overview" }, { id: "extrema", title: "Extrema" }], edges: [{ from: "overview", to: "extrema" }], version: 1 };
const created: string[] = [];
after(() => { for (const id of created) chatStore.deleteChat(id); });

describe("paper lesson policy", () => {
 it("repairs backtick-wrapped equations for reading and export, preserving literal code", () => {
  assert.equal(normalizePaperNotation("Set `$A=3$` and `$x_i$`."), "Set `A=3` and $x_i$.");
  for (const literal of ["`$HOME`", "`$x$`", "```c\n`$A=3$`\n```", "`echo $A=3$`", "`A = 3`"]) assert.equal(normalizePaperNotation(literal), literal);
  assert.match(sessionMarkdown([prose("Set `$A=3$`.")], { anchors: false }), /Set `A=3`/);
 });

	it("defaults to exposition with bounded checks; validates settings without losing explicit zero", () => {
		assert.deepEqual(resolveTeachingPreferences(), PAPER_TEACHING_DEFAULTS);
		assert.equal(resolveTeachingPreferences({ checkpoints: 0 }).checkpoints, 0);
		for (const raw of [null, [], { style: "lecture-ish" }, { checkpoints: -1 }, { checkpoints: "6" }, { calibration: 3 }, { predictions: "false" }]) assert.equal(parseTeachingPreferences(raw).ok, false);
		assert.equal(parseTeachingPreferences({ checkpoints: 0, style: "paper" }).ok, true);
	});
	it("replaces conflicting default doctrine instead of appending a contradictory preference", () => {
		const paper = composeInstructions("teacher", {}, PAPER_TEACHING_DEFAULTS);
		assert.match(paper, /Explanation-first teaching/);
		assert.doesNotMatch(paper, /every step, with `quiz`|Every teaching unit is a|there is no schedule to keep/);
		assert.match(composeInstructions("teacher", {}, { style: "guided" }), /every step, with `quiz`/);
	});
	it("rejects an untaught question and admits an application after the explanation", () => {
		assert.match(paperQuestionProblems({ name: "quiz", args: question, messages: [optIn()], preferences: PAPER_TEACHING_DEFAULTS }).join(), /absent/);
		assert.deepEqual(paperQuestionProblems({ name: "quiz", args: question, messages: [optIn(), prose()], preferences: PAPER_TEACHING_DEFAULTS }), []);
		assert.match(paperQuestionProblems({ name: "quiz", questionId: "cold", args: question, messages: [optIn(), call("quiz", question, "cold"), prose()], preferences: PAPER_TEACHING_DEFAULTS }).join(), /absent/);
		assert.match(paperQuestionProblems({ name: "quiz", args: { ...question, grounding: undefined }, messages: [optIn(), prose()], preferences: PAPER_TEACHING_DEFAULTS }).join(), /grounding/);
	});
 it("requires a learner opt-in, and keeps completion separate from assessment", () => {
  assert.match(paperQuestionProblems({ name: "quiz", args: question, messages: [prose()], preferences: PAPER_TEACHING_DEFAULTS }).join(), /opt-in/);
  assert.match(paperQuestionProblems({ name: "quiz", args: question, messages: [optIn(), prose(), { role: "user", content: "Continue reading", timestamp: 4 } as never], preferences: PAPER_TEACHING_DEFAULTS }).join(), /opt-in/);
  const progress = result("lesson_progress", { ok: true, complete: true });
  assert.deepEqual(paperLessonStatus([progress, prose()]), { overviewComplete: true, explained: true, assessed: 0 });
  assert.equal(paperLessonStatus([progress, result("quiz", { correct: true })]).assessed, 1);
  assert.equal(paperLessonStatus([progress, result("quiz", { correct: false }), result("assessment_review", { questionId: "quiz", state: "invalidated", reason: "Bad key" })]).assessed, 0);
 });
	it("enforces no-check mode and disables graded predictions", () => {
		assert.match(paperQuestionProblems({ name: "quiz", args: question, messages: [optIn(), prose()], preferences: { ...PAPER_TEACHING_DEFAULTS, checkpoints: 0 } }).join(), /budget/);
		assert.match(paperQuestionProblems({ name: "quiz", args: { ...question, type: "predict" }, messages: [optIn(), prose()], preferences: PAPER_TEACHING_DEFAULTS }).join(), /Predictions/);
		assert.match(paperQuestionProblems({ name: "probe", args: { prerequisiteOnly: false }, messages: [], preferences: PAPER_TEACHING_DEFAULTS }).join(), /prerequisites/);
	});
	it("caps calibration and repair loops and moves on after successful reasoning", () => {
		const probes = [0, 1].flatMap(i => [call("probe", { prerequisiteOnly: true }, `p${i}`), result("probe", { correct: false }, `p${i}`)]);
		assert.match(paperQuestionProblems({ name: "probe", args: { prerequisiteOnly: true }, messages: probes, preferences: PAPER_TEACHING_DEFAULTS }).join(), /Calibration budget/);
		const attempted = [optIn(), prose(), call("quiz", question, "q1"), result("quiz", { correct: false }, "q1")];
		assert.deepEqual(paperQuestionProblems({ name: "quiz", args: question, messages: attempted, preferences: PAPER_TEACHING_DEFAULTS }), []);
		attempted.push(call("quiz", question, "q2"), result("quiz", { correct: false }, "q2"));
		assert.match(paperQuestionProblems({ name: "quiz", args: question, messages: attempted, preferences: PAPER_TEACHING_DEFAULTS }).join(), /retry limit/);
		assert.match(paperQuestionProblems({ name: "quiz", args: question, messages: [optIn(), prose(), call("quiz", question), result("quiz", { correct: true })], preferences: PAPER_TEACHING_DEFAULTS }).join(), /successful check/);
	});
	it("does not count a teacher-invalidated item as a failed learning attempt", () => {
		const history = [optIn(), prose(), call("quiz", question), result("quiz", { correct: false }), result("assessment_review", { questionId: "quiz", state: "invalidated", reason: "Ambiguous wording" })];
		assert.equal(assessmentReviews(history).get("quiz")?.state, "invalidated");
		assert.deepEqual(paperQuestionProblems({ name: "quiz", args: question, messages: history, preferences: { ...PAPER_TEACHING_DEFAULTS, checkpoints: 1, repairRetries: 0 } }), []);
	});
	it("advances phase and map through exposition, with no graded answer", () => {
		const history = [call("probe_done", {}), result("probe_done", { ok: true }), call("lesson_progress", { nodeId: "overview", summary: "Motivation" }), result("lesson_progress", { ok: true, nodeId: "overview", summary: "Motivation" }), prose("Two tests may cover identical code but establish different driver values."), call("lesson_progress", { nodeId: "extrema", summary: "Extrema" }), result("lesson_progress", { ok: true, nodeId: "extrema", summary: "Extrema" }), prose()];
		const view = projectView(history);
		assert.equal(phaseAt3Lh(history), "teach"); assert.equal(phaseAt3(view), "teach");
		assert.equal(derivePlanStatusesLh(tree, history).current, "extrema");
		assert.equal(derivePlanStatuses(tree, view).current, "extrema");
		assert.ok(derivePlanStatusesLh(tree, history).visited.has("overview"));
	});
	it("exports actual choices, both thinking channels, confidence and corrected assessment", () => {
		const history = [call("quiz", question, "q"), result("quiz", { questionText: question.question, questionType: "check", options: [{ index: 1, label: "Extremum" }, { index: 2, label: "No signal" }], answers: [{ label: "No signal", index: 2 }], correct: false, thinking: "I thought ranges recorded every value", readingThinking: "What is stored?", confidence: 50, explanation: "11 exceeds the historical maximum." }, "q"), result("assessment_review", { questionId: "q", state: "invalidated", reason: "Teacher's key was inconsistent" }), result("ask_user_question", { questionText: "Goal?", answers: [{ label: "Understand the mechanism" }] })];
		const text = sessionMarkdown(history, { anchors: false });
		for (const expected of ["Selected answer:", "No signal", "I thought ranges", "What is stored?", "50%", "invalidated", "Understand the mechanism", "Question type:"]) assert.ok(text.includes(expected), expected);
		assert.doesNotMatch(text, /\[object Object\]|The learner answered incorrectly/);
	});
 it("continues a plan-only opening into real teaching without learner approval", async () => {
  const chat = chatStore.createChat("Opening recovery"); created.push(chat.id); chatStore.saveTree(chat.id, tree);
  const faux = createFauxCore({});
  faux.setResponses([
   fauxAssistantMessage([fauxText("I will explain the motivation, mechanism and results. Shall we begin?")]),
   fauxAssistantMessage([fauxToolCall("lesson_progress", { nodeId: "overview", summary: "Overview" }, { id: "opening" }), fauxText(excerpt)], { stopReason: "toolUse" }),
   fauxAssistantMessage([fauxText("Here is how the feedback changes which input is retained.")]),
  ]);
  const teacher = createTeacherAgent({ chatId: chat.id, chatStore, jobStore: {} as never, spawn: () => {}, searchAvailable: () => false }, { engine: { model: faux.getModel(), streamFn: faux.streamSimple }, teachingPreferences: PAPER_TEACHING_DEFAULTS });
  await teacher.prompt("Teach me this paper");
  assert.ok(teacher.state.messages.some(m => m.role === "toolResult" && m.toolName === "lesson_progress" && !m.isError));
  assert.equal(teacher.state.messages.filter(m => m.role === "user").length, 1);
 });
	it("runs a scripted explanation-first teacher through production tools and rejects a cold quiz", async () => {
		const chat = chatStore.createChat("Synthetic StateFuzz lesson"); created.push(chat.id); chatStore.saveTree(chat.id, tree);
		const faux = createFauxCore({});
		faux.setResponses([
			fauxAssistantMessage([fauxToolCall("quiz", question, { id: "cold" })], { stopReason: "toolUse" }),
			fauxAssistantMessage([fauxToolCall("lesson_progress", { nodeId: "extrema", summary: "How extrema complement ranges" }, { id: "progress" }), fauxText(excerpt)], { stopReason: "toolUse" }),
			fauxAssistantMessage([fauxToolCall("quiz", question, { id: "warm" })], { stopReason: "toolUse" }),
		]);
		const teacher = createTeacherAgent({ chatId: chat.id, chatStore, jobStore: {} as never, spawn: () => {}, searchAvailable: () => false }, { engine: { model: faux.getModel(), streamFn: faux.streamSimple }, teachingPreferences: PAPER_TEACHING_DEFAULTS, teachingHistory: () => [] });
		await teacher.prompt("Teach me StateFuzz. I have not read it. Then check my understanding.");
		const messages = teacher.state.messages as LhMessage[];
		assert.ok(messages.some(m => m.role === "toolResult" && m.toolCallId === "cold" && m.isError));
		assert.ok(messages.some(m => m.role === "toolResult" && m.toolName === "lesson_progress" && !m.isError));
		assert.ok(messages.some(m => m.role === "assistant" && m.content.some(b => b.type === "toolCall" && b.id === "warm")));
		assert.ok(!messages.some(m => m.role === "toolResult" && m.toolCallId === "warm" && m.isError));
	});
});
