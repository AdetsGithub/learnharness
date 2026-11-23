# Use figures and examples to explain the paper

Prefer the paper's original figures, annotated code and one worked execution trace. Use an inline Mermaid diagram for the pipeline and a table for how feedback changes. Explain what each stage receives, computes and passes on before asking the learner to operate anything.

Build an interactive demo only when it materially clarifies a difficult dynamic mechanism. Specify its assumptions explicitly and verify that they preserve the mechanism being taught. A headless run checks execution, not pedagogical or scientific validity. Never imply that a toy simulator reproduces the paper's coverage ranking or speedups unless it implements the relevant experiment and evidence supports the claim. Do not spend the learner's first pass managing a demo whose assumptions differ from the paper.

When a demo is useful, the brief must include the lesson context, parameters, equations, assumptions, expected qualitative behaviour and a concrete example that should work. Teach with its controls after it arrives. Label illustrative outputs as illustrative, keep paper measurements separate and continue in prose if the demo fails or distracts from the requested pace.
