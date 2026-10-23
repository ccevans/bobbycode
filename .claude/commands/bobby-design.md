---
description: "Design it — references → teardowns → mockups → locked spec → build → check"
argument-hint: "<ticket ID, or what to design — e.g. 'landing page for my habit tracker'>"
---

Load and follow the skill in `.claude/skills/bobby-design/SKILL.md` to design the specified subject. Resume from whatever artifacts already exist in `.bobby/design/`.

Given a ticket ID, run the chain with `bobby run design <id>` — research → analyze → mockup → spec → build → check, one human reaction gate per stage. Given a plain-language subject and no ticket, follow the skill directly.

This skill creates design. Auditing an already-running app against its brand is `/bobby-ux` instead.
