# Product scope

## Objective

AegisID explores a safer way to reuse the result of identity checks. An authorized KYC
issuer verifies a person once and issues a signed credential. The holder keeps it in a
wallet and proves only the claims a relying service requests, such as “KYC complete” or
“18+”. The relying service receives a proof and a service-scoped pseudonym rather than
another Aadhaar image, document number, or date of birth.

The product is India-first because repeated identity-document uploads and long remote
onboarding flows are the motivating problem. The public app is an engineering prototype
with synthetic credentials. It does not perform real KYC, replace a regulated entity's
customer due diligence, or access Aadhaar, CKYCR, DigiLocker, or CIBIL systems.

## Who it is for

- **People onboarding to digital services** who want fewer repeated document uploads
  and less identity data disclosed to each service.
- **Regulated financial institutions and their KYC providers** that may issue or accept
  a reusable credential after their own approved identity-proofing process.
- **Relying services** that need a fresh, issuer-backed answer to a specific eligibility
  question while avoiding receipt of unrelated identity fields.
- **Engineers and reviewers** examining the wallet, proof circuit, trust registry, and
  verifier integration.

## Current prototype

The working demonstration uses a synthetic issuer. It signs a credential containing a
date of birth, random credential UID, KYC-complete flag, and expiry date. The browser
proves that the signature is from the trusted issuer, KYC is marked complete, the
credential is unexpired, and the holder meets the 18+ predicate. The proof is bound to a
short-lived verifier challenge. It does not reveal the date of birth, UID, or signature.

The synthetic issuer does not inspect or verify anyone's documents. The demo must never
be described as a completed real KYC check. The copied receipt is a convenience record,
not a signed, portable credential or a regulatory approval.

## Why it does not replace vKYC or CIBIL

KYC, age eligibility, video KYC, and credit information are different claims with
different issuers and rules.

- RBI describes V-CIP as a live, informed, consent-based audio-visual identity and
  customer-due-diligence process performed by an authorized regulated-entity official.
  A ZK proof can reduce later disclosure only if that entity accepts the credential; it
  cannot perform liveness, face matching, or the entity's required CDD. See the [RBI
  KYC FAQ](https://www.rbi.org.in/scripts/FAQView.aspx?Id=173) and [Master Direction on
  KYC](https://www.rbi.org.in/Scripts/BS_ViewMasDirections.aspx?id=13040).
- RBI's KYC directions already describe CKYCR lookup using a KYC Identifier and limit
  when a regulated entity may ask for the same KYC records again. A practical pilot
  should complement that process rather than claim it is unnecessary. See [RBI Master
  Direction on KYC](https://www.rbi.org.in/Scripts/BS_ViewMasDirections.aspx?id=13090).
- CIBIL is a credit information company, not an identity issuer. A future privacy
  feature could prove a score band only if an authorized credit-information source
  issues a suitable signed claim and the relying service has the required consent and
  access. This repository has no bureau integration or credit-score claim. See [RBI's
  registered credit information companies](https://www.rbi.org.in/scripts/bs_viewcontent.aspx?Id=4921)
  and [RBI Credit Information Reporting Directions](https://www.rbi.org.in/scripts/NotificationUser.aspx?Id=12764).

## KYC credential flow

1. A real regulated entity or contracted KYC provider performs the required identity
   checks off-chain. Aadhaar files, video, face templates, PAN, and source documents
   stay within that approved process and are never written to a blockchain.
2. If the issuer is authorized to do so, it issues a signed, expiring credential to the
   holder's wallet. The public demo substitutes a synthetic credential generator.
3. A relying service requests explicit claims and creates a fresh challenge.
4. The holder's browser creates a zero-knowledge proof locally. It sends the proof,
   public challenge context, and an app-scoped pseudonym to the verifier.
5. The verifier checks the proof, expiry, trusted issuer, challenge freshness, and
   replay state. A chain registry anchors issuer public-key hashes only; it stores no
   holder identifier, Aadhaar value, document, score, or credential UID.

The Web2 deployment is the website, serverless API, and Redis-backed challenge state.
The EVM testnet is used only for public issuer-trust metadata. Hosting the dApp on
Vercel does not put personal data on-chain or prevent the browser from using a wallet
and public blockchain.

## India pilot boundary

The DPDP Act defines a child as an individual under 18 and section 9 addresses
processing children's personal data, including parental consent. Proving 18+ does not
verify a parent or satisfy every data-protection obligation. The project's age proof is
an attribute proof, not legal advice or a compliance certificate. Check the current
commencement and requirements for the specific service before a pilot.

Primary sources: [DPDP Act, 2023 (MeitY)](https://www.meity.gov.in/static/uploads/2024/02/Digital-Personal-Data-Protection-Act-2023.pdf),
[commencement notification G.S.R. 843(E) (Official Gazette)](https://egazette.gov.in/WriteReadData/2025/267647.pdf),
and [DPDP Rules, 2025 (MeitY)](https://www.meity.gov.in/static/uploads/2025/11/53450e6e5dc0bfa85ebd78686cadad39.pdf).

For DigiLocker document access, an organization must become an approved integration
partner and complete its legal and technical onboarding. This project has no partner
credentials. Its BabyJubjub EdDSA-Poseidon credential signature is not compatible with
arbitrary DigiLocker documents. A real connector needs approved access, a data-flow
review, and a carefully designed issuer adapter. See [DigiLocker integration
onboarding](https://www.digilocker.gov.in/web/implementation-model) and [partner
resources](https://entity.digilocker.gov.in/web/resources).

## What remains before a real pilot

1. Obtain a real KYC issuer or regulated-entity partner and define which source checks
   it performs and which signed claims it is allowed to issue.
2. Determine how the proof supplements CKYCR and where vKYC or enhanced due diligence
   remains necessary.
3. Design a production credential format, issuer key custody, expiry, revocation, key
   rotation, and lawful repeat-use policy with that partner.
4. Complete an independent cryptographic and application-security review, including a
   multi-party Groth16 setup ceremony.
5. Review privacy, retention, accessibility, incident response, service availability,
   and data-location requirements with the regulated relying service.
6. Add a separately authorized credit-information integration before any CIBIL or
   score-band claim is offered.

Until these requirements are met, use only synthetic credentials and describe AegisID
as a privacy-preserving KYC proof prototype. See [the threat model](threat-model.md),
[deployment guide](deployment.md), and [proof-system notes](proof-system.md) for
technical limits.
