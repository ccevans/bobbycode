# Brief — Sam dashboard

**Job:** design-research (step 1) · **Subject type:** product UI, not a marketing page

## The subject

**Sam** — a job finder that runs **locally, always**. It watches for roles while you get on
with your life, and for each match it prepares a **tailored résumé you can review and submit**.
It does not submit for you.

## Audience

Someone job hunting, technical enough to run local software. Likely checking in **once or
twice a day**, not living in the app.

## The dashboard's single job

> **Show what Sam found while you weren't looking, and what's ready to send.**

## What "always running" changes

This is a **feed with unread state**, not a query tool. Design consequences:

- There is a **"since you last looked"** state. That is the emotional core — the app worked
  while you didn't.
- Sam has a **liveness** — it is scanning right now. That must be visible without being noisy.
- Matches **accumulate and go stale**. Age and freshness are first-class data.
- The user's job is **triage**, not search: keep / dismiss / prepare.

## What "prepares a résumé" changes

The centre of gravity is a **two-stage pipeline**, not a job board:

```
found → matched → résumé ready → you submit → tracked
```

- A match is not the deliverable — a **ready-to-send résumé** is.
- "Ready to review" is the most important status in the product.
- Each résumé is *tailored to that role*, so the diff from the base CV is meaningful content.

## What "local" changes

Privacy is the differentiator, and it is **structural, not a badge**:

- No account, no sync, no cloud spinner
- Real filesystem paths, a real process, real CPU — the app can be honest about being software
  on a machine rather than a tab
- It can show things a cloud tool cannot: *"nothing left this computer"*

## Design stance

A dashboard is **scanned and operated**, not read. Per `craft_principles.md`:

- Surface the summary before the detail
- Encode state in **form as well as number** — pills, chips, severity stripes
- Semantic colour (ready / stale / dismissed) is separate from the accent
- What is interactive must look interactive

## Assumptions to correct if wrong

- Single user, single machine, one active job search
- Sam watches multiple sources; the sources matter less than the matches
- Résumé tailoring is per-role and reviewable before sending
