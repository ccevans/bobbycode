# Test Cases — TKT-067: Pair-once addressing over RelayTransport

## TC-1: Request with project field routes to the named project

**Precondition:** Studio with projects "alpha" and "beta". Tunnel has
ProjectContext pointing to "alpha".
**Steps:**
1. Send an encrypted req frame: `{ t: 'req', id: '1', method: 'GET', path: '/api/tickets', project: 'beta' }`.
2. Inspect which project's ticketsDir the proxied request hits.
**Expected:** The server receives the request scoped to "beta" (projectContext
was switched before the proxy). Response includes beta's tickets.

## TC-2: Request without project field uses current project (backward compat)

**Precondition:** Studio tunnel with ProjectContext pointing to "alpha".
**Steps:**
1. Send an encrypted req frame: `{ t: 'req', id: '1', method: 'GET', path: '/api/tickets' }`.
**Expected:** No project switch occurs. Response includes alpha's tickets.

## TC-3: Subscribe with project field scopes the SSE stream

**Precondition:** Studio tunnel with ProjectContext.
**Steps:**
1. Send a sub frame: `{ t: 'sub', id: 's1', path: '/api/events', project: 'beta' }`.
2. Trigger a workspace event in project "beta".
**Expected:** The SSE stream receives the event. No events from "alpha"
leak into this subscription.

## TC-4: Hi frame includes projects list in studio mode

**Precondition:** Studio with projects "alpha", "beta", "gamma".
**Steps:**
1. Connect the tunnel to the relay.
2. Capture the hi frame sent on connection.
**Expected:** Hi frame contains `{ t: 'hi', project: <active>, version: ..., projects: ['alpha', 'beta', 'gamma'] }`.

## TC-5: Hi frame has single-element projects in non-studio mode

**Precondition:** Single-project (non-studio) bobby remote.
**Steps:**
1. Connect the tunnel.
2. Capture the hi frame.
**Expected:** `projects: ['<project-name>']` (one entry, no picker needed).

## TC-6: Non-studio tunnel ignores project field in requests

**Precondition:** Non-studio tunnel (no ProjectContext).
**Steps:**
1. Send a req frame with `project: 'anything'`.
**Expected:** The project field is ignored (no ProjectContext to switch).
The request proxies normally to the single project's API.

## TC-7: One pairing code works for all projects in a studio

**Precondition:** Studio root pairing via `loadOrCreatePairing(studioRoot)`.
**Steps:**
1. Pair a phone with the studio pairing code.
2. Send a req targeting project "alpha".
3. Send a req targeting project "beta".
**Expected:** Both requests succeed with the same pairing. No second scan
or paste is needed.

## TC-8: Switching project on consecutive requests

**Precondition:** Studio tunnel with two projects.
**Steps:**
1. Send req with `project: 'alpha'`, wait for response.
2. Send req with `project: 'beta'`, wait for response.
3. Send req with `project: 'alpha'` again.
**Expected:** Each response is scoped to the correct project. No state
leak between switches.

## TC-9: Presence reconnect re-sends hi with projects list

**Precondition:** Studio tunnel connected.
**Steps:**
1. Simulate a relay presence event (`{ type: 'presence', clients: 1 }`).
2. Capture the hi frame sent in response.
**Expected:** Hi frame includes the full `projects` array (same as on
initial connect).

## TC-10: Error — project field names a non-existent project

**Precondition:** Studio tunnel with projects "alpha" and "beta".
**Steps:**
1. Send req with `project: 'nonexistent'`.
**Expected:** The tunnel sends back a res frame with status 400 or 404
and an error message naming the unknown project. No crash.
