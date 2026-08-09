# Review — TKT-023

## Verdict: Rejected

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
