/** Isolated production UI/API regression for paper lessons. No model or credentials. */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import net from "node:net";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { setTimeout as delay } from "node:timers/promises";
import puppeteer from "puppeteer-core";
import { probeEnv } from "./smoke-demo-runtime.mjs";
const root = path.resolve(import.meta.dirname, "..");
const standalone = path.resolve(process.argv[2] ?? path.join(root, ".next/standalone"));
const home = fs.mkdtempSync(path.join(os.tmpdir(), "lh-paper-smoke-"));
const evidence = path.join(root, "dist", "paper-teaching-evidence");
fs.mkdirSync(evidence, { recursive: true });
fs.writeFileSync(path.join(home, "auth.json"), JSON.stringify({ OPENROUTER_API_KEY: "synthetic-offline-never-sent" }), { mode: 0o600 });
fs.mkdirSync(path.join(home, "data"));
fs.writeFileSync(path.join(home, "data/settings.json"), JSON.stringify({ version: 1, models: Object.fromEntries(["strong", "cheap", "vision"].map(slot => [slot, { model: { provider: "openrouter", id: "z-ai/glm-5.3-flash" } }])) }));
const listener = net.createServer(); listener.listen(0, "127.0.0.1"); await once(listener, "listening"); const port = listener.address().port; await new Promise(resolve => listener.close(resolve));
const origin = `http://127.0.0.1:${port}`;
const child = spawn(process.execPath, [path.join(standalone, "server.js")], { cwd: standalone, env: { ...probeEnv(process.env, home), PORT: String(port), HOSTNAME: "127.0.0.1" }, stdio: ["ignore", "pipe", "pipe"] });
let log = ""; child.stdout.on("data", data => { log = (log + data).slice(-10000); }); child.stderr.on("data", data => { log = (log + data).slice(-10000); });
let browser;
async function request(route, method = "GET", body) {
	const r = await fetch(origin + route, { method, headers: { Origin: origin, ...(body !== undefined ? { "Content-Type": "application/json" } : {}) }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
	assert.equal(r.status, 200, `${method} ${route}: ${await r.clone().text()}`); return r.json();
}
try {
	let ready = false;
	for (let i = 0; i < 100; i++) { if (await fetch(origin).then(r => r.ok).catch(() => false)) { ready = true; break; } await delay(300); }
	assert.ok(ready, log);
	const created = await request("/api/chats", "POST", { title: "Synthetic StateFuzz paper" });
	const route = `/api/chats/${created.id}/teaching`;
	const initial = await request(route); assert.equal(initial.teaching.style, "paper"); assert.equal(initial.teaching.checkpoints, 6);
	await request(route, "PUT", { ...initial.teaching, checkpoints: 0, calibration: 0 });
	const chatFile = path.join(home, "data/chats", `${created.id}.json`);
	const record = JSON.parse(fs.readFileSync(chatFile, "utf8"));
	const assistant = (id, content) => ({ id, role: "assistant", content, api: "openai-completions", provider: "synthetic", model: "synthetic", timestamp: Date.now(), stopReason: "stop", usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } } });
	const result = (id, toolName, details) => ({ id: `r-${id}`, role: "toolResult", toolCallId: id, toolName, details, content: [{ type: "text", text: JSON.stringify(details) }], isError: false, timestamp: Date.now() });
	record.tree = { nodes: [{ id: "overview", title: "Overview" }, { id: "mechanism", title: "Mechanism" }], edges: [{ from: "overview", to: "mechanism" }], version: 1 };
	record.messages = [
		assistant("p", [{ type: "toolCall", name: "probe_done", id: "probe-end", arguments: { assessment: "The paper is unfamiliar. Essential prerequisites remain unassessed; explain them as needed." } }]), result("probe-end", "probe_done", { ok: true }),
		assistant("section", [{ type: "toolCall", name: "lesson_progress", id: "section-start", arguments: { nodeId: "mechanism", summary: "A worked driver example" } }]), result("section-start", "lesson_progress", { ok: true, nodeId: "mechanism", summary: "A worked driver example" }),
		assistant("explanation", [{ type: "text", text: "StateFuzz retains syscall inputs when persistent driver values reach useful new ranges or extrema. The corpus stores inputs; instrumentation records their observed effects. This is a synthetic UI test, not a model-authored lesson." }]),
		assistant("question", [{ type: "toolCall", name: "quiz", id: "q", arguments: { question: "What is stored?", type: "check", nodeId: "mechanism", options: [{ label: "Inputs", value: "a" }, { label: "Snapshots", value: "b" }], correctAnswer: "a", explanation: "Inputs are retained." } }]),
		result("q", "quiz", { kind: "quiz", questionText: "What is stored?", answers: [{ label: "Snapshots", value: "b", index: 2 }], correct: false, dontKnow: false, options: [{ index: 1, label: "Inputs" }, { index: 2, label: "Snapshots" }], answeredAt: new Date().toISOString() }),
		assistant("review", [{ type: "toolCall", name: "assessment_review", id: "review-q", arguments: { questionId: "q", state: "invalidated", reason: "Synthetic ambiguous question, withdrawn." } }]), result("review-q", "assessment_review", { ok: true, questionId: "q", state: "invalidated", reason: "Synthetic ambiguous question, withdrawn." }),
		assistant("next", [{ type: "text", text: "Next we will work through the three feedback signals together." }]),
	];
	fs.writeFileSync(chatFile, JSON.stringify(record));
	browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH ?? "/snap/chromium/current/usr/lib/chromium-browser/chrome", headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"], userDataDir: path.join(home, "browser") });
	const page = await browser.newPage(); await page.setViewport({ width: 1440, height: 1000 });
	const errors = []; page.on("pageerror", e => errors.push(String(e)));
	await page.setRequestInterception(true);
	let continuation;
	page.on("request", req => { if (new URL(req.url()).pathname === "/api/chat" && req.method() === "POST") { continuation = JSON.parse(req.postData()); void req.respond({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Synthetic offline smoke: generation disabled" }) }); } else void req.continue(); });
	const firstSettings = page.waitForResponse(r => new URL(r.url()).pathname === route && r.status() === 200);
	await page.goto(`${origin}/chat/${created.id}`, { waitUntil: "domcontentloaded" });
	await firstSettings;
	await page.waitForSelector('[data-testid="continue-reading"]');
	await page.waitForSelector('[data-testid="assessment-review"]');
	assert.match(await page.$eval('[data-testid="assessment-review"]', e => e.textContent), /invalidated/);
	await page.click('[data-testid="paper-lesson-bar"] button');
	await page.waitForSelector('select[aria-label="Lesson checks"]');
	assert.equal(await page.$eval('select[aria-label="Lesson checks"]', e => e.value), "0");
	await page.select('select[aria-label="Lesson checks"]', "4");
	await page.waitForFunction(() => !document.querySelector('[data-testid="teaching-controls"]').disabled);
	await page.waitForFunction(async route => (await fetch(route).then(r => r.json())).teaching.checkpoints === 4, {}, route);
	const reloadedSettings = page.waitForResponse(r => new URL(r.url()).pathname === route && r.status() === 200);
	await page.reload({ waitUntil: "domcontentloaded" });
	await reloadedSettings;
	await page.click('[data-testid="paper-lesson-bar"] button');
	await page.waitForSelector('select[aria-label="Lesson checks"]');
	assert.equal(await page.$eval('select[aria-label="Lesson checks"]', e => e.value), "4");
	await page.screenshot({ path: path.join(evidence, "paper-lesson.png"), fullPage: true });
	// Read-and-continue sends a durable text event, not a synthetic correct answer.
	continuation = undefined;
	await page.click('[data-testid="continue-reading"]');
	for (let i = 0; !continuation && i < 50; i++) await delay(100);
	assert.equal(continuation?.input?.type, "text"); assert.match(continuation.input.text, /substantial explanation/);
	assert.deepEqual(errors, []);
	fs.writeFileSync(path.join(evidence, "result.json"), JSON.stringify({ ok: true, checks: ["paper defaults", "zero-check reading mode", "persisted session controls", "invalidated assessment display", "durable ungraded continuation", "no browser runtime errors"], profile: "temporary synthetic profile; removed after run" }, null, 2));
	console.log("[paper-smoke] paper settings, assessment correction, reload and ungraded continuation passed");
} catch (e) { console.error(log); throw e; }
finally { await browser?.close(); child.kill("SIGTERM"); await Promise.race([once(child, "exit"), delay(5000)]); if (child.exitCode === null) child.kill("SIGKILL"); fs.rmSync(home, { recursive: true, force: true }); }
