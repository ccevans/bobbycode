# Platform Packs

`bobby audit` scores any codebase on the guards every serious app needs. A
**pack** adds the expectations of a *particular kind of product* on top: what a
multi-tenant SaaS, a marketplace, or an AI product needs before it is finished.

A pack carries three things:

- **Checks** — domain-specific audit rules, scored alongside the baseline.
- **A roadmap** — the ordered work to a complete product, seeded as tickets.
- **Scaffolds** *(optional)* — files dropped in to skip the boring parts.

```bash
bobby pack list                  # what's installed
bobby pack info saas-starter     # what it checks and where it leads
bobby audit --pack saas-starter  # score against it
bobby pack apply saas-starter    # seed the roadmap as tickets
bobby go                         # start working it
```

Packs are **data, not code** — declarative YAML, so they are safe to install and
cheap to write. They are also fully local: like the audit itself, no model calls
and no network.

## Layout

```
my-pack/
  pack.yml        meta + checks + roadmap
  scaffolds/      optional; copied in by `bobby pack apply` (never overwrites)
```

**Namespace rule:** never name a scaffolded agent, skill, or command `bobby-*` — that prefix
is reserved for core, and `bobby init --refresh` prunes stale `bobby-*` files as its own.
Use your pack id as the prefix (`revenue-pricing.md`). Pack-scaffolded agents are runnable
with `bobby run <name>` like any custom agent.

Discovery order, later winning on an id collision:

1. Built-in packs shipped with Bobby
2. `~/.bobby/packs/` — installed with `bobby pack add --global`
3. `.bobby/packs/` — installed into one project with `bobby pack add`

## pack.yml

```yaml
id: saas-multitenant           # defaults to the directory name
name: Multi-Tenant SaaS
version: 1.0.0
domain: One deployment, many customer organisations   # shown in listings
description: >
  What a B2B multi-tenant SaaS needs before it can safely onboard company #2.

# Skip the whole pack where it makes no sense.
appliesWhen:
  anyOf:
    - grep: "tenant|organi[sz]ation|workspace"
    - dep: "stripe"

checks:
  - id: tenant-scoping
    area: data                 # security | reliability | operability | change-safety | product | data | revenue
    severity: critical         # critical | high | medium | low
    title: Every owned row carries a tenant id
    why: Shared tables without a tenant column are one bad WHERE clause from a data leak.
    fix: Add a tenant column to every owned table and filter every query by it.
    workflow: secure           # optional; security areas default to `secure`
    appliesWhen:               # optional; skip this check on repos where it can't apply
      file: "migrations|schema"
    detect:
      grep: "tenant_id|organization_id"
      in: "migrations|schema|db"

roadmap:
  - title: Scope every table to a tenant
    priority: critical         # critical | high | medium | low
    area: data
    workflow: secure
    description: >
      Decide the tenancy model and apply it everywhere. This is the hardest
      thing to retrofit, so it comes first.
    criteria:
      - Every owned table has a tenant column.
      - Every query filters by the current tenant.
      - A test proves cross-tenant reads return nothing.
    skipWhen:                  # optional; drop the item when the repo already has it
      grep: "tenant_id"
```

## Detect rules

Rules describe **evidence**, not logic. Five primitives, three combinators:

| Rule | Passes when |
|---|---|
| `grep: "<regex>"` | any text file matches (case-insensitive) |
| `grep: "<regex>"` + `in: "<path regex>"` | …restricted to matching paths |
| `file: "<path regex>"` | a file path matches |
| `dep: "pkg"` or `dep: ["a","b"]` | any named package is a dependency |
| `script: "name"` | `package.json` has that npm script |

| Combinator | Passes when |
|---|---|
| `anyOf: [rule, …]` | at least one passes |
| `allOf: [rule, …]` | all pass |
| `none: rule` | the inner rule does **not** pass |

`grep` searches code plus the places evidence usually hides: `.sql`, `.prisma`,
`.graphql`, `.md`, `.json`, `.yml`, `.toml`, `.sh`. Dependency directories,
build output, and `.bobby/` are never scanned.

## Scoring

Pack checks are **added to** the baseline, never replace it — a domain pack tells
you what your product needs *on top of* being a sound codebase. Scores are
severity-weighted (critical 5, high 3, medium 2, low 1) and reported per area, so
`product` and `data` show up as their own dimensions alongside security and
reliability.

Checks whose `appliesWhen` fails are **skipped**, not counted against you.

## Paid packs

Bobby's core is MIT and stays that way. Paid packs are unlocked by **Bobby
Pro** — one subscription covering every paid pack, now and every one released
later. A pack opts in with two lines:

```yaml
released: 2026-07-28        # when this version shipped (see "lapsing" below)
license:
  pro: true
  buy: https://your-checkout-url
```

```bash
bobby pro                     # status, and what it unlocks here
bobby pro activate <key>      # verifies offline, stores in ~/.bobby/licenses.yml
```

A pack can also be sold standalone with its own signing key, which works the
same way and is unlocked by either its own key or Pro:

```yaml
license:
  product: my-pack
  buy: https://your-checkout-url
  publicKey: |
    -----BEGIN PUBLIC KEY-----
    ...
    -----END PUBLIC KEY-----
```

A key is `base64url(payload).base64url(ed25519 signature)`. Verification is a
signature check against a public key we ship — **no server, no account, no
network call**, and it works offline forever.

### Lapsing keeps what you paid for

A Pro key carries an `expires` date, but expiry does not take anything away.
Everything you already have keeps working forever; renewing is what adds packs
released *since* your updates ended — that is what `released` is compared
against. A pack with no `released` date is never withheld.

This exists so packs, which are separate products, can be sold without
infrastructure. The threat model is honest: it stops casual copying and gives
buyers a clean activation step. Someone determined can patch an open-source
CLI — the value is the content and its updates, not the lock.

## Writing a pack

1. `mkdir my-pack && $EDITOR my-pack/pack.yml`
2. `bobby pack add ./my-pack`
3. `bobby audit --pack my-pack --all` — `--all` shows what passed, which is how
   you tell a working rule from one that never matches.
4. Iterate. A rule that can never pass is worse than no rule: it teaches people
   to ignore the score.

Two habits that keep packs honest:

- **Write `why` for a stranger.** The check tells someone their app is not
  finished; it should say what breaks if they ignore it.
- **Make `fix` an instruction, not a wish.** "Add a tenant column and filter
  every query" beats "improve tenancy".
