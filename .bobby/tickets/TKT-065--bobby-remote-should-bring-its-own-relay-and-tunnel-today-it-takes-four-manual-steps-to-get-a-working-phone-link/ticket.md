---
id: TKT-065
title: >-
  `bobby remote` should bring its own relay and tunnel — today it takes four
  manual steps to get a working phone link
stage: backlog
type: improvement
priority: high
area: cli
author: unknown
assigned: null
services: null
repos: null
workflow: null
blocked: false
blocked_reason: null
previous_stage: null
parent: null
feature: null
persona: null
created: '2026-08-09'
updated: '2026-08-09'
---

## Description

Getting a working phone link tonight took four manual steps that the user should
never have seen:

1. Start the relay by hand from `bobbycode-pro/hq`, with `WEB_DIR` set to the
   app so one origin serves both
2. Start a TLS tunnel separately (`ngrok http 8790`) — required, not optional,
   see TKT-064
3. Read the tunnel's public URL out of the ngrok API
4. Re-run `bobby remote --relay wss://… --app https://…` with both URLs threaded
   through by hand

Every one of those is knowledge the tool has or could get. The default
(`ws://127.0.0.1:8790`) points at a relay that is not running, on a scheme no
phone can use, so the out-of-the-box experience is a QR that fails.

`bobby remote` with no arguments should end in a QR that works. That means it
owns the whole path: start (or find) the relay, establish a TLS endpoint, serve
the app from that origin, pair, verify, print.

Design questions worth deciding before building, which is why this is filed
rather than patched:

- **Whose tunnel?** ngrok is what is installed here and what the machine has
  used before, but it puts an interstitial in front of every first visit on the
  free tier — one more unexplained wall for the user. cloudflared has no
  interstitial. Bundling neither and detecting both is the cheap answer;
  hosting the relay ourselves (PRO-001, pro board) removes the question
  entirely for anyone on Pro.
- **Does the free tier get this at all?** The relay is `bobbycode-pro`. If the
  MIT package cannot start one, `bobby remote` in the free tier can only ever
  point at something the user runs. That is a product decision, and it should
  be stated in the command's help rather than discovered.

## Acceptance Criteria

- [ ] `bobby remote` with no arguments produces a link that works on a phone
- [ ] The relay is started if it is not already running, and the app is served
      from the same origin
- [ ] A TLS endpoint is established automatically, or the command explains
      exactly what to do and why it is required
- [ ] If a tunnel provider puts an interstitial in front of the link, the CLI
      says so before the user meets it
- [ ] The free-tier story is stated in `--help`, not discovered
