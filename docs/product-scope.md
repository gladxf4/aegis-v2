# Product scope

## Objective

AegisID is an India-first technical pilot for online services that need an 18+ access
check. The holder keeps a signed credential in their browser, proves the rule locally,
and sends the verifier a proof bound to a short-lived challenge, without sending their
date of birth or credential identifier.

The current rule is fixed at 18 years. This repository is an engineering prototype,
not an identity provider, legal-compliance product, or production age-assurance service.
An 18+ result does not establish that a relying service has met parental-consent or
other obligations under India's data-protection framework.

## Who it is for

- **Credential holders** who need to prove eligibility while disclosing less personal
  information.
- **Online services** that need a yes/no age decision and want a small verification
  API.
- **Engineers and reviewers** who need to inspect the circuit, trust model, API, and
  deployment path.

## What works today

- A browser can request a pre-signed synthetic sample from a finite pool or import a
  credential JSON file locally.
- The browser creates the Groth16 proof; the server receives only the proof, public
  signals, and challenge token.
- The verifier pins one issuer key hash, checks the challenge context, and prevents
  challenge replay and repeated credential use within one application.
- Demo-sample retrieval, challenge issuance, and proof verification have per-IP request
  limits. In production, shared Redis is required so rate limits and replay state span
  serverless instances.
- A local acceptance bench covers valid, invalid, replay, and tampering cases.
- The Vercel build serves static assets and deploys the API as Node functions.

These behaviours use synthetic credentials and a development Groth16 setup. The
copyable receipt is an unsigned summary, not a credential or bearer token.

## Gaps in the current app

The public deployment demonstrates the proof flow. It is not yet a holder wallet or an
issuer/verifier product:

- **Credential source.** The app serves pre-signed synthetic samples from a pool of
  1,024 unique credentials and accepts a project-specific JSON shape. There is no
  trusted issuance service or standard credential exchange.
- **Credential lifecycle.** Credentials have no expiry or revocation check. Imported
  credentials live in page memory only; there is no wallet backup, recovery, or
  persistent storage.
- **Age policy.** The rule is fixed to 18 and uses `YYYYMMDD - 180000` in the circuit.
  That is a simplified calendar comparison and does not define a jurisdiction's
  treatment of leap-day birthdays.
- **Repeat-use policy.** A nullifier is consumed once per credential and application.
  The verifier has no configurable purpose or time window for repeat checks. Each
  pre-signed sample can be used once; the public pool is only a finite demo resource.
- **Verifier response.** The receipt is an unsigned summary for display and copy. It
  cannot be independently authenticated by another service.
- **Operations.** The API has basic per-IP request limits and requires Redis in
  production. It still lacks alerting, an operator audit trail, and a retention policy
  for persistent nullifiers. The rate-limit identifiers are HMAC-derived and expire
  after one minute; the verifier does not store the raw address in its rate-limit keys.

These gaps are product decisions as well as implementation work. A real credential
issuer, supported age policy, and relying-party use case must be chosen before the app
can make real-world eligibility claims.

## Recommended build order

1. **Make the public demo repeatable.** Keep a pool of unique, pre-signed synthetic
   samples so visitors can demonstrate a valid check without disabling replay or
   nullifier protection. The app now does this for up to 1,024 sample credentials.
2. **Finish the holder/developer loop.** Add a clearly synthetic local issuer and a
   small holder wallet workflow, then document how to connect a verifier without
   claiming that the demo issuer proves anyone's real age.
3. **Choose interoperability and lifecycle.** Select a credential format and define
   expiry, revocation, key rotation, portability, and repeat-use semantics with a
   relying-party use case.
4. **Prepare a real pilot.** Confirm the issuer, jurisdiction-specific age rule,
   proving-key ceremony, security review, abuse controls, and operational ownership.

## India pilot boundary

Section 2(f) of the Digital Personal Data Protection Act, 2023 defines a child as an
individual under 18. Section 9 addresses processing children's personal data, including
verifiable parental consent. The Government's phased commencement notification places
sections 7 to 10 in its eighteen-month group. The Act and Rules therefore need to be
reviewed against the selected service and the provisions in force when it launches.
This project does not implement parental verification, consent capture, or a general
DPDP compliance workflow. It only demonstrates a cryptographic 18+ predicate using a
synthetic issuer.

For a real India pilot, a candidate source is a DigiLocker-issued document accessed
through an approved Requester integration. DigiLocker describes partner vetting, legal
agreements, technical onboarding, validation, and an approved go-live process. This
repository has no requester credentials or approval. Its custom BabyJubjub
EdDSA-Poseidon credential is not interchangeable with a DigiLocker document; a real
integration needs an approved data flow and a reviewed issuer adapter or compatible
credential issuance path. See [DigiLocker partner integration](https://www.digilocker.gov.in/web/implementation-model)
and [partner resources](https://entity.digilocker.gov.in/web/resources).

Primary sources: [DPDP Act, 2023 (MeitY)](https://www.meity.gov.in/static/uploads/2024/02/Digital-Personal-Data-Protection-Act-2023.pdf),
[commencement notification G.S.R. 843(E) (Official Gazette)](https://egazette.gov.in/WriteReadData/2025/267647.pdf),
and [DPDP Rules, 2025 (MeitY)](https://www.meity.gov.in/static/uploads/2025/11/53450e6e5dc0bfa85ebd78686cadad39.pdf).

## What a real pilot needs

Treat these as explicit work items before connecting a real issuer or relying party:

1. **Issuer integration.** Agree on a credential schema, key custody, issuance
   ceremony, expiry, revocation, and key rotation. Replace the public demo signing key
   and the project-specific credential JSON exchange.
2. **Policy and repeat use.** Define the age rule for the target jurisdiction, including
   calendar boundaries, and decide whether a relying party can verify the same holder
   again for another session or purpose.
3. **Circuit review.** Independently review date encoding and edge cases, credential
   binding, nullifier scope, and the trusted setup. Publish build inputs and ceremony
   evidence.
4. **Holder wallet.** Define import, local storage, backup, recovery, and deletion
   behavior for credentials. Review browser storage risks before persisting private
   fields.
5. **Operational state.** Configure shared Redis in every deployed environment and
   confirm replay and duplicate checks remain atomic under concurrent requests.
6. **Abuse controls.** Keep the API's shared per-IP limits, then add platform edge
   protection, request monitoring, alerting, and a retention policy for challenge and
   nullifier data.
7. **Verifier integration.** Define how a relying service receives the result, how it
   handles retries, and whether it needs a signed, independently verifiable response.
8. **User review.** Test with keyboard and screen-reader users, measure proof time and
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
