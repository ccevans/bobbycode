---
id: TKT-064
title: >-
  `bobby remote` says "Team is reachable" before it is, and for URLs no phone
  can ever use
stage: backlog
type: bug
priority: critical
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

Observed tonight, end to end, on a real iPhone. It cost about forty minutes and
every signal the tool gave was wrong.

`commands/remote.js:125` prints the verdict unconditionally, straight after
`tunnel.connect()`:

    tunnel.connect();
    ...
    success('  Team is reachable. Press Ctrl+C to stop.');

`connect()` does not block, so the claim is made before the connection exists.
The tool's own log from tonight, in order:

    line 12: Team is reachable. Press Ctrl+C to stop.
    line 14: relay connected

Two claims are being made here and neither is checked:

**1. That the relay is connected.** It is not, yet. If the relay is down the
message still prints, and the QR beneath it is still offered.

**2. That a phone can use the link.** This is the expensive one. Every frame is
AES-256-GCM via `crypto.subtle`, and browsers only expose Web Crypto in a
**secure context** — https, or localhost. Measured:

    http://192.168.1.209:8790   isSecureContext=false   crypto.subtle=false
    http://127.0.0.1:8790       isSecureContext=true    crypto.subtle=true

So `--app http://<lan-ip>` produces a QR that CANNOT work on any phone, ever,
and the tool prints it under a green tick. The phone then fails at
`importKey` — and because that happens inside the pairing path, the app blames
the paste ("that code did not parse"), sending the user off to re-copy a string
that was always correct.

`bobby remote` has everything it needs to know this at print time: it holds the
relay URL and the app URL. A non-loopback `http://` app URL, or a `ws://` relay,
is a configuration that only works in a browser on this machine.

**What it should do instead:**

- Refuse to print a QR for a link no phone can use. Say why — "this address is
  http:// on the network, and browsers only allow encryption over https, so a
  phone cannot pair with it" — and name the fix.
- Wait for the tunnel to actually attach before claiming reachability, and say
  "connecting…" until then.
- Prove the path rather than assuming it: attach as a client, run one encrypted
  round trip against `/api/health`, and only then say it is reachable. This is
  ~30 lines and is exactly what had to be written by hand tonight to find out
  the truth.

The lesson generalises past this command: a green tick that is printed rather
than earned is worse than no tick, because it sends the user to look for the
fault everywhere except where it is.

## Acceptance Criteria

- [ ] "Team is reachable" prints only after a verified encrypted round trip
- [ ] Until then the CLI shows a connecting state, not a success
- [ ] A non-loopback `http://` app URL or a `ws://` relay is refused, with a
      message naming the secure-context requirement and the fix
- [ ] A relay that is down produces a clear failure, not a QR
- [ ] Covered by tests: relay down, relay up but no host, insecure URL, and the
      happy path
