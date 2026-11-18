# Contributing

## Before changing code

Read [the product scope](docs/product-scope.md), [the protocol](docs/protocol.md),
and [the threat model](docs/threat-model.md). They describe what the prototype proves
and where its guarantees stop.

## Code conventions

- JavaScript uses two spaces, double-quoted strings, semicolons, and `camelCase` names.
- Circuit and API field names retain `snake_case` where they are part of the proof
  interface. Keep those names consistent across Circom, JSON, and the verifier.
- Keep API handlers thin. Put reusable protocol and state logic in `lib/`.
- Write comments for security assumptions, non-obvious constraints, and decisions.
  Avoid comments that merely restate the next line of code.
- Keep synthetic credentials and the development issuer clearly labelled. Never add a
  private issuer key, secret, or real person's credential to the repository.
- Credit vendored or adapted code and preserve its license notices. See
  [third-party notices](THIRD_PARTY_NOTICES.md).

## Before opening a pull request

Run these commands from the repository root:

```bash
npm ci
npm run format:check
npm run lint
npm test
npm run prepare:web
```

Update the relevant protocol, product-scope, or deployment document when a change
alters a guarantee or setup step. Do not describe the unsigned demo receipt as a
credential or authorization token.
