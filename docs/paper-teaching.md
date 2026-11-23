# LearnHarness Papers

This fork teaches research papers through explanations and worked examples before asking the learner to apply unfamiliar material. It is based on upstream LearnHarness, with a separate desktop identity and profile.

## Using the AppImage

Make the AppImage executable and open it. Configure your provider connection and model slots in Settings → Providers / Agent, then choose **Teach paper** and attach a PDF or a folder of supporting notes. A useful opening request is: “Explain this paper. I have not read it. Start with the problem and end-to-end mechanism, then a worked example, design trade-offs, evaluation and limitations.”

The application uses **~/.config/LearnHarness Papers/** on Linux. It does not modify the original LearnHarness profile. Provider connections must be configured in this profile. Existing accounts can be signed into normally; no credentials or personal learning records ship in the build.

## Lesson controls

**Settings → Agent → Paper teaching** sets defaults for new lessons. **Lesson settings**, above an open lesson, changes that session only. Model-picker changes preserve the session's teaching policy.

- **Paper · explanation first**: direct explanations, a worked pipeline, limited application checks and a final synthesis.
- **Guided discovery**: upstream Socratic teaching. Practice remains a separate session type.
- **Prerequisite checks**: zero to two calibration questions; the paper's own mechanisms are assumed unfamiliar.
- **Lesson checks**: default maximum six across a first pass. Choose **None · read and continue** for uninterrupted exposition.
- **Retries per section**: default one. An unresolved point should be explained directly and marked for later practice.
- **Pre-teaching predictions**: off by default. If enabled, the teacher may use its prediction mechanic; predictions are exploratory, not evidence of an established misconception.

Counts are maximums, not targets. They are product defaults rather than empirically established optimal teaching frequencies. **Continue reading** asks for the next substantial explanation using the normal durable user-message path. The teacher updates the map through `lesson_progress`, independently of graded questions. A visited section is not a mastery score.

## Assessment and accuracy

Paper-mode question admission requires an exact excerpt from already presented teaching, a source reference and the teacher's explicit answer-key check. It enforces calibration/checkpoint limits, disables predictions when configured, bounds retries and prevents another check on a section with a successful check. Rejected tool calls do not become graded attempts. The guard checks these contracts, not the semantic truth of a paper or answer key: the language model must still verify the original source, and can make mistakes.

Use **Not taught yet · explain this first** to request instruction without an incorrect grade. The teacher can append an `assessment_review` identifying an item as unassessed, untaught, skipped, invalidated, needs-practice or demonstrated. Invalidated items no longer show a wrong-answer badge; the original response stays in the record and export. Corrections override interpretation without rewriting history. These states and the teaching policy survive context compaction. Attached notes and graph propositions do not establish learner mastery.

Original-paper claims, explanatory interpretations, toy examples, later released-code behaviour and empirical findings must remain distinct. Engineering choices are motivated, not presented as inevitable deductions. A runnable demo is not experimental evidence.

## Exports

Markdown exports include question type, options, actual selected option text, free responses, confidence, question reasoning, thinking while reading, committed answers/explanations and assessment corrections. Structured preference answers no longer render as `[object Object]`.

## Building and checking

Use Node 26 on Linux:

```sh
npm ci
npm run plugins:setup
npm run typecheck
npm test
npm run lint
npm run papers:appimage
```

The AppImage is written under `dist/`. After packaging, run `node scripts/smoke-papers-appimage.mjs` on Linux with Xvfb to verify the actual mounted AppImage, desktop API, lesson controls and isolated profile. `node scripts/smoke-paper-teaching.mjs` independently checks the standalone UI using synthetic lesson data. The `papers:appimage` command builds and checks the standalone server before invoking Electron Builder with `--publish never`. Packaged smoke checks use synthetic isolated profiles. Automatic updates are off by default, and any explicit update check uses this fork's release feed, not upstream's.

The regression scenario in `tests/paper-teaching.test.ts` uses an injected scripted model and a synthetic StateFuzz-style example. It checks cold-question rejection, explanation-before-check flow, budgets, repair limits, map navigation without quizzes, invalidation and full exports. These tests establish runtime contracts, not the teaching quality of every configured live model. No real provider billing is needed for the tests.

The original AGPL-3.0-only licence and upstream attribution are retained. Source: https://github.com/AdetsGithub/learnharness/tree/paper-teaching

## Version 0.7.2: reading, depth and voluntary checks

The session bar offers Continue reading and Check my understanding independently. A native lesson question requires an explicit learner request; the grounding and budget guards still apply. Set Lesson checks to None to remove that action. Prerequisite calibration remains separately configurable. After feedback, choose another check explicitly rather than entering an automatic retry loop.

The bar distinguishes material explained from understanding assessed. Overview completion replaces Continue reading with Explain the difficult details and Work through a case study, alongside the optional check. A typed Continue after completion requests a deeper worked mechanism. Reading completion never claims mastery.

Paper prompts limit the opening route to three sentences, keep the detailed map collapsible, require intermediate representations in worked traces, compare the contribution with relevant prior approaches, and discourage repeated caveats and examples. The runtime rejects readiness/plan-acceptance tool questions and retries a plan-only teacher opening up to twice in the same run. These bounds improve recovery but do not guarantee every model will follow the desired prose length.

Backtick-wrapped equations such as `$A=3$` are repaired in teaching display and Markdown export. Source history is preserved; fenced code, shell variables and literal code examples remain unchanged.

Validation uses scripted model responses and isolated browser/AppImage profiles. It establishes policy and UI behavior, not learning outcomes or the factual quality of a live generated lesson. Test the new version with a fresh paper session to assess those qualities.
