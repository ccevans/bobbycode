# Review — TKT-023

## Round 2 (commit 7f2d41e) — Verdict: Rejected (narrowly — three small items)

Re-review of the rejection fixes. All five code claims were verified rather
than trusted; the substance of round 1 is fixed and proven, but the id-rotation
approach introduced one real host-side defect, its 2s retry guard has a race,
and the R3 descope is legitimate in substance but unrecorded — the tickets it
defers to either don't cover the deferred scope or don't exist.

### Verified fixed (independently, not from the claims)

- **R1** — resubscribe is now keyed to presence offline→online
  (relay-transport.js:97–104), which correctly covers fresh attach, relay
  bounce, and host restart on a live socket; `t:'end'` re-opens after 2s.
  A useful property of the design: a `resub` frame dropped while the host is
  absent is always recovered by the next presence arrival.
- **R2** — `connect()` clears `retryTimer`, detaches all four handlers on the
  prior socket and closes it, and every handler guards `this.ws !== ws`
  (lines 65–83). Traced the CLOSING-socket interleaving from round 1: the old
  socket's `onclose` is nulled, so no presence flap, no third socket, no
  duplicate delivery.
- **N1** — request timeout closes the socket (line 191), handing recovery to
  `onclose → scheduleReconnect`. The iOS zombie-OPEN path now self-heals.
- **N2** — a `res` frame sets online (line 117). Ordering with resubscribe is
  safe: a `res` implies the host was attached when the `req` was routed, and
  the relay's presence frame precedes it on the same ordered socket.
- **N4** — a failing fragment is cleared from the address bar and its reason
  surfaces via `takePairingFromUrl.lastError` → `showPairing(...)`.
- **Test** — `app/test/relay-transport.test.js` is a faithful R1 reproduction:
  real relay (`hq/relay/server.js`), real `RemoteTunnel`, stub dashboard with a
  live SSE stream, host killed and restarted while the client socket stays up,
  and the assertions are data-level (`seen == [1, 2]`) plus a request
  round-trip. **Ran it: 2/2 pass on 7f2d41e. Ran it against the pre-fix
  transport (6c4d55a) in a throwaway worktree: fails (`not ok`, pass 0) —
  the red→green claim is genuine.**

### R2-1 (major, new in this commit) — id rotation leaks orphan streams host-side on every client reconnect

`resub()` (lines 169–174) rotates to a fresh id but never sends `unsub` for
the old one. The comment claims the host's "socket-close cleanup reaps" the
orphan — but that cleanup runs on the **host's** socket closing (tunnel.js
`stopAllSubs` on its own `ws close`), and in the most common reconnect shape —
phone wakes, **client** socket died, host and relay stayed up — the host's
socket never closes. The host still holds the old sub (tunnel.js reaps subs
only on unsub, stream end, or its own socket close), so each client reconnect
leaks one open SSE connection tunnel→dashboard per subscription, each pumping
encrypted `ev` frames onto the channel forever; the phone decrypts and drops
every one (unknown id). iOS kills background sockets on most suspends —
dozens of reconnects a day against a `bobby remote` that runs for days.
Pre-fix this path was accidentally clean (same-id resub → host's duplicate-id
refusal left the original stream serving the still-matching client id); the
rotation fixed the host-restart case and traded it for this leak.

**Fix (one line):** in `resub()`, before rotating:
`this.sendFrame({ t: 'unsub', id: h.id }).catch(() => {});` — harmless when
the host lost its state, reaps the orphan when it didn't.

**Test suggestion:** the existing harness catches this directly — bounce the
CLIENT socket (host up), then assert `api.streams.size` returns to exactly 1;
today it would be 2.

### R2-2 (minor but real) — the `end`-retry guard doesn't survive an intervening rotation

Line 128: `setTimeout(() => { if (this.subs.get(h.id) === h) this.resub(h); }, 2000)`
reads `h.id` at **fire** time, but `resub()` mutates `h.id` in place — so if a
presence-keyed resubscribe rotates the handle during the 2s window, the guard
still passes (`subs.get(newId) === h`) and the handle is resubbed a second
time: duplicate sub churn plus one more orphan (compounding R2-1). Capture the
id at schedule time: `const id = h.id; setTimeout(() => { if (this.subs.get(id) === h) this.resub(h); }, 2000);`
— after a rotation `subs.get(oldId)` is undefined and the retry correctly
stands down. (View-unsubscribe is already handled correctly by the guard.)

### R3 ruling — descope legitimate in substance, not yet legitimate on the record

- **AC4** (hq/web retired/reduced) deferred to TKT-026: TKT-026's actual text
  owns deleting **`/classic/` in bobbycode** (route, templates, tiering
  promise) — it does not mention `hq/web` in bobbycode-pro anywhere. As
  written, the deferred work has no home. Amend TKT-026's scope/ACs to name
  hq/web, or file a dedicated ticket.
- **AC5** (multi-project pair-once addressing) deferred "to its own ticket":
  that ticket **does not exist** — `pair-once`/`multi-project` appear nowhere
  in `.bobby/tickets/` outside TKT-023 itself. The parent epic TKT-020 covers
  multi-project only at the "every child shipped or explicitly deferred with a
  reason recorded" level. File the ticket under TKT-020.
- Substantively the descope is sound: both items are separable from the
  transport work, and AC5 was epic-scope leakage into a child ticket. Once
  (a) both deferrals have named tickets and (b) TKT-023's AC4/AC5 are
  annotated with the deferral pointers, this ruling flips to accepted —
  it is minutes of ticket work, but it must exist before this AC set can pass.

### Round-2 notes (non-blocking)

- Pairing regression edge: `takePairingFromUrl` now calls `replaceState` on
  decode failure, so a hand-typed slash-less route hash (`#board` — which
  `currentRoute()` accepts) is eaten on the local app and lands on Home;
  pre-fix it survived. Nav buttons always write `#/board`, so hand-typed only.
- `takePairingFromUrl.lastError` as function-property state works but a module
  local with an accessor would be cleaner.
- N3 (≠32-byte key saved, relay blamed) and N5 (no-timeout local probe) remain
  open as acknowledged — still non-blocking.
- Round-1 note on pending requests waiting their full 15s across a disconnect
  also still stands, softened by N1's socket close.

---

## Round 1 (commits e6c2e0d, 6c4d55a) — Verdict: Rejected

Reviewed commits e6c2e0d and 6c4d55a on bobbycode-pro `feat/relay-transport`
(app/ only; app/test/analytics.test.js excluded as unrelated recovery).
No test suite exists in app/ — per pipeline instruction, evidence is code
reading, traced against the host side in bobbycode `lib/remote/tunnel.js`,
`lib/remote/crypto.js`, and the relay `hq/relay/server.js`.

## Files Reviewed

- `app/app/lib/relay-crypto.js` — byte layout verified against host
  `lib/remote/crypto.js`: nonce(12) | tag(16) | ct on both sides, base64url
  alphabet identical, WebCrypto tag re-seating correct on both encrypt and
  decrypt paths. Chunked `fromCharCode` guards the stack. Host's `< 29` length
  check is absent client-side, but `subtle.decrypt` throws on garbage and the
  caller catches. **Contract confirmed.**
- `app/app/lib/relay-transport.js` — the interface shape (request/subscribe/on,
  `{status, body}` resolution, non-2xx resolves rather than rejects) matches
  LocalTransport. Frame types and presence envelope match tunnel.js and
  server.js. Reconnect logic has the two bugs below.
- `app/app/lib/pairing.js` — decode traced for wrong-but-plausible acceptance:
  none found. Every liberal path (fragment take, whitespace strip, leading-`/`
  strip) still terminates in a decode failure or the v/c/k/r shape check.
  Key touches localStorage only; fragment stripped via replaceState on success.
- `app/app/app.js` — boot path, transport selection, pairing screen wiring,
  `#nav-classic` hiding. `store.transport` assigned before any await after the
  relay starts, so the presence→refresh handler cannot race a null transport.
- `app/app/index.html`, `app/app/style.css` — pairing view on the shipped
  design system; `role="alert"` on the error; no new tokens. Clean.
- Verb audit across `app/app/views/` + libs: 9× GET, 10× POST, nothing else —
  inside tunnel.js's `ALLOWED_METHODS`. Both subscribe paths (`/api/events`,
  `/api/workspaces/<id>/events`) pass `isAllowedPath`.

## Code Concerns

### R1 (major) — Subscriptions die silently when the host comes back on a live socket

`resubscribe()` runs only in `ws.onopen` (relay-transport.js:72–76), but the
subscription state it restores lives on the **host**, whose lifecycle is
independent of the client's socket. Two concrete paths leave the stream
permanently dead while the presence dot is green:

1. `bobby remote` restarts: the new tunnel has an empty `subs` map. The relay
   sends `presence host:true`; the client calls `setOnline(true)`, app.js
   `refresh()`es once — and no `sub` frames are ever re-sent, because the
   client's socket never closed. `/api/events` is dead for the rest of the
   session.
2. The local dashboard restarts under a live tunnel: the host's SSE ends,
   tunnel.js sends `{t:'end', id}` and deletes the sub. The client's
   `onmessage` handles only `res` and `ev` — `end` (and `hi`) are dropped on
   the floor, the sub stays in `this.subs`, and nothing re-opens it.

LocalTransport's EventSource auto-reconnects in the same scenarios, so this is
a view-observable behavioural difference — precisely what the seam (and this
file's own PRO-006 header) promises not to have. The build's browser evidence
killed the *relay* (which kills the client socket and exercises onopen); it
never killed the *host* with the socket up.

**Fix:** resubscribe on the presence offline→online transition (in `setOnline`
or a presence listener), and handle `t:'end'` — re-send the sub (with backoff)
or surface the failure. Both hooks exist already; this is small.

### R2 (major) — Stale-socket race: connect() never detaches or closes the previous socket

`connect()` overwrites `this.ws` but leaves the old socket's handlers attached
and the old socket open, and never clears `retryTimer`. Concrete interleaving:
`onVisible` fires while the old socket is CLOSING (`readyState > OPEN` passes)
→ `connect()` opens socket B → old socket A's `onclose` fires →
`setOnline(false)` (presence flap against a healthy B) + `scheduleReconnect()`
→ timer opens socket C while B is fine. B is now orphaned but open with a live
`onmessage`: two attached clients on the channel, duplicate `ev` delivery to
views, and B's eventual close schedules yet another reconnect — socket churn
that can self-perpetuate. A phone app lives through suspend/resume cycles all
day; this window is not exotic.

**Fix:** at the top of `connect()`: clear `retryTimer`; if `this.ws` exists,
null its handlers and close it; guard every handler body with
`if (this.ws !== ws) return;`.

### R3 (major) — Two acceptance criteria have no coverage in this diff

- **AC4** "The separate HQ web frontend is retired or reduced to a shell" —
  `hq/web` is untouched; the build comment explicitly defers it ("NOT done
  here: deleting hq/web").
- **AC5** "Multi-project addressing (the pair-once protocol) works from the
  phone" — nothing in the diff addresses project addressing; the pairing is
  one channel = one host, requests carry no project qualifier, and the build
  comment does not claim this AC.

Either implement them or get the ticket formally descoped by the human — the
review cannot check boxes nothing satisfies.

### Notes (non-blocking, fix while in there or file follow-ups)

- **N1 — Zombie-OPEN socket after phone wake:** `onVisible` reconnects only
  when `readyState > OPEN`, but iOS can resume with a dead socket still
  reporting OPEN. The 15s request timeout then fires `setOnline(false)` without
  tearing the socket down — every subsequent request eats the full 15s and no
  reconnect is ever triggered until the TCP stack notices. On request timeout,
  `this.ws.close()` to force the reconnect path.
- **N2 — Sticky-offline presence:** `setOnline(true)` comes only from relay
  presence frames. One >15s request flips the dot offline and nothing flips it
  back even as later requests succeed (LocalTransport sets online on every
  success). Cheap fix: `setOnline(true)` on any `res` frame.
- **N3 — Wrong error attribution on a bad key:** a pairing whose `k` decodes to
  ≠32 bytes passes `decodePairingCode`, is **saved to localStorage**, then
  `importKey` throws in `start()` and boot blames the relay ("Could not open a
  connection to that relay"). Reloads re-hit the saved bad pairing. Validate
  `keyBytes.length === 32` in `decodePairingCode`.
- **N4 — Silent link failures:** `takePairingFromUrl` swallows decode errors,
  so a truncated *link* shows the bare pairing form with no message (PRO-012's
  messages only surface on the paste path), and the fragment — partial key
  material — stays in the address bar because `replaceState` runs only on
  success.
- **N5 — Unbounded no-pairing boot:** `hasLocalApi()` goes through
  LocalTransport's fetch, which has no timeout — a hung local API leaves a
  blank screen indefinitely. (The relay-static case 404s fast; the pairing
  screen path is fine.)

## Decision Violations

- `decisions-log-has-one-writer` — not violated; nothing touches decisions.yaml.
- The code and ticket cite decision `one-frontend-two-transports`, which did
  not exist in `.bobby/decisions.yaml`. Recorded during this review via
  `bobby decision add` (ticket TKT-023). R1 is a violation of exactly that
  constraint: a view *can* observe which transport it got.

## AC Verification

- [x] AC1 RelayTransport implements request/subscribe/on over the relay —
  relay-transport.js, contract shape verified against LocalTransport and
  tunnel.js (with the R1/R2 caveats on the reconnect story).
- [x] AC2 The app frontend runs unchanged over the relay — views untouched;
  verbs and paths inside the host allowlist; only boot chose a transport.
- [x] AC3 Phone gets the same views including Feature — single frontend, same
  hash routes; `#nav-classic` correctly hidden where it cannot work.
- [ ] AC4 HQ web frontend retired/reduced — **not in this diff** (R3).
- [ ] AC5 Multi-project pair-once addressing — **not in this diff** (R3).

## Test/Lint Output

- Tests: not run — no suite exists in `app/`; per pipeline instruction the
  evidence is the code reading above.
- Lint: not run for the same reason; nothing in the diff trips the obvious
  static issues.

## What is genuinely good here

- The crypto port is exactly right, byte-for-byte, including the WebCrypto tag
  re-seat, and the file says loudly that it is a contract.
- The pairing decode's paste tolerance is careful without ever accepting a
  wrong-but-plausible code.
- Only `attach` routing metadata and ciphertext frames ever reach the relay;
  the key exists in exactly two places (localStorage, memory).
- The boot ordering comments (config-before-refresh, stream-after-boot) carry
  their reasons with them.
