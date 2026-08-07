---
id: TKT-023
title: 'RelayTransport: the same frontend over the encrypted relay'
stage: backlog
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
updated: '2026-08-07'
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
