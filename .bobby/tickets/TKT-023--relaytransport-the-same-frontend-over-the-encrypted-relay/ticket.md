---
id: TKT-023
title: 'RelayTransport: the same frontend over the encrypted relay'
stage: reviewing
type: feature
priority: medium
area: remote
author: unknown
assigned: null
services: null
workflow: null
blocked: false
blocked_reason: null
previous_stage: null
parent: TKT-020
created: '2026-08-07'
updated: '2026-08-09'
---

## Description

There are currently two frontends: the app (templates served locally) and the
HQ phone web app (a separate PWA in bobbycode-pro/hq/web). They drift.

The transport seam was built for exactly this — LocalTransport is fetch +
EventSource; RelayTransport implements the same tiny interface over the
E2E-encrypted relay frames. Port it, point the phone at the app, and retire the
duplicate frontend.

## Acceptance Criteria

- [ ] RelayTransport implements request/subscribe/on over the relay protocol
- [ ] The app frontend runs unchanged over the relay
- [ ] The phone gets the same views as the desktop app, including the Feature view
- [ ] The separate HQ web frontend is retired or reduced to a shell
- [ ] Multi-project addressing (the pair-once protocol) works from the phone

## Comments
- [2026-08-09] bobby-build: RelayTransport built and verified end-to-end in bobbycode-pro e6c2e0d (branch feat/relay-transport). The App runs over the encrypted relay at 390px against a live host: no-pairing cold load shows the pairing screen, the link pairs, presence goes online, Home renders the real board. hq/web is now retirable — everything it did, the App does, on the shipped design system. Carried across: the frame crypto (a contract with lib/remote/crypto.js), reconnect with jittered backoff + resubscribe + foreground-reconnect (PRO-006), and the paste tolerance HQ lacked (PRO-012). Folded in PRO-008 since it was the same boot block. NOT done here: deleting hq/web, and the service worker + push (PRO-005).
