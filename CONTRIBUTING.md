# Contributing to Bobby

Thanks for your interest in improving Bobby. It's an open-source tool for solo
builders, and contributions that keep it simple and honest are very welcome.

## Getting started

```bash
git clone https://github.com/ccevans/bobbycode.git
cd bobbycode
npm install
npm test        # full test suite
npm run lint    # ESLint
```

Bobby is plain ES-module JavaScript (Node 18+). There is no build step — the
`bobby` command runs `bin/bobby.js` directly.

## Ground rules

- **Keep the solo-builder lens.** Every feature is evaluated against
  [docs/POSITIONING.md](docs/POSITIONING.md): does it help one person shipping
  alone, without adding ceremony? Team-coordination features are out of scope.
- **Tests are required.** New behavior needs tests; `npm test` and `npm run lint`
  must pass. CI runs them on Node 18, 20, and 22.
- **One change per PR.** Small, focused pull requests get reviewed fastest.
  Open an issue first for anything large so we can agree on the approach.
- **Match the surrounding code.** Follow the existing naming, comment density,
  and structure of the file you're editing.
- **User-facing changes update the docs.** README command tables, `CHANGELOG.md`
  under `[Unreleased]`, and any relevant skill/agent templates.

## Reporting bugs & requesting features

Use the issue templates. A good bug report includes the command you ran, what
you expected, what happened, and your Node/OS versions.

## Releasing (maintainers)

See the "Releasing" section in the [README](README.md#releasing-maintainers).
