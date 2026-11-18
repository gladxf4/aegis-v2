# Product scope

## Objective

AegisID demonstrates how an online service can check one age rule without receiving a
person’s date of birth or credential identifier. The holder keeps a signed credential
in their browser, proves the rule locally, and sends the verifier a proof bound to a
short-lived challenge.

The current rule is fixed at 18 years. This repository is an engineering prototype,
not an identity provider or a production age-assurance service.

## Who it is for

- **Credential holders** who need to prove eligibility while disclosing less personal
  information.
- **Online services** that need a yes/no age decision and want a small verification
  API.
- **Engineers and reviewers** who need to inspect the circuit, trust model, API, and
  deployment path.

## What works today

- A browser can load a synthetic sample or import a credential JSON file locally.
- The browser creates the Groth16 proof; the server receives only the proof, public
  signals, and challenge token.
- The verifier pins one issuer key hash, checks the challenge context, and prevents
  challenge replay and repeated credential use within one application.
- A local acceptance bench covers valid, invalid, replay, and tampering cases.
- The Vercel build serves static assets and deploys the API as Node functions.

These behaviours use synthetic credentials and a development Groth16 setup. The
copyable receipt is an unsigned summary, not a credential or bearer token.

## What a real pilot needs

Treat these as explicit work items before connecting a real issuer or relying party:

1. **Issuer integration.** Agree on a credential schema, key custody, issuance
   ceremony, expiry, and key rotation. Replace the public demo signing key.
2. **Circuit review.** Independently review date encoding and edge cases, credential
   binding, nullifier scope, and the trusted setup. Publish build inputs and ceremony
   evidence.
3. **Operational state.** Configure shared Redis in every deployed environment and
   confirm replay and duplicate checks remain atomic under concurrent requests.
4. **Abuse controls.** Add edge rate limits, request monitoring, alerting, and a
   retention policy for challenge and nullifier data.
5. **Verifier integration.** Define how a relying service receives the result, how it
   handles retries, and whether it needs a signed, independently verifiable response.
6. **User review.** Test with keyboard and screen-reader users, measure proof time and
   memory on supported devices, and explain exactly what each verifier learns.

## Production bar

Before making a production claim, require all of the following:

- A multi-party proving-key ceremony with a public transcript.
- A production issuer and a documented process for revocation and key rotation.
- Shared durable state and abuse controls on the public API.
- Independent cryptographic and application-security review.
- Privacy, retention, accessibility, incident-response, and service-availability
  decisions owned by the deploying organization.
- A deployment health check confirming the expected app id, issuer, and shared store.

Until those decisions are made, keep the public project labelled as a prototype and
use only synthetic credentials. See [the threat model](threat-model.md),
[the deployment guide](deployment.md), and [the proof-system notes](proof-system.md)
for the current technical limits.
