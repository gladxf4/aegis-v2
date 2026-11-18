# Nullifiers

## Definition

```text
nullifier = Poseidon(credential_uid, app_id)
```

`credential_uid` is a random field element chosen when the credential is issued.
`app_id` is derived from the configured application name. Both inputs are hidden
inside the proof; only the nullifier is public.

## What it guarantees

For a fixed application:

- the same credential always produces the same nullifier;
- a different credential produces a different nullifier with overwhelming
  probability;
- a proof cannot change the nullifier without changing `credential_uid` or `app_id`,
  because the circuit constrains the relation;
- a verifier can reject a second proof from the same credential by storing the
  nullifier.

This is the mechanism behind `DUPLICATE_NULLIFIER`.

## Application scoping

The nullifier is not global. The same credential verified by two applications
produces two unrelated values. This limits cross-application tracking but does not
provide unlinkability against an application that sees the credential in another
context.

Changing `APP_ID` changes every nullifier for the application. Treat the application
name as part of the protocol identifier, not as a display label that can be edited
casually.

## Replay protection

A nullifier stops a second proof from the same credential. It does not stop a replay
of the same proof. Replay protection comes from the challenge id:

1. The server checks the HMAC token.
2. The server verifies the proof.
3. The server consumes the challenge id with `SET NX EX`.
4. A second request with the same token receives `CHALLENGE_USED`.

A fresh challenge produces a new nonce, so the old proof cannot satisfy the new
challenge. The nonce is bound into the proof and compared with the token.

## Failure order

The current verifier consumes the challenge before inserting the nullifier. If a
valid proof arrives for a credential that was already verified, the challenge is
spent and the response is `DUPLICATE_NULLIFIER`. The next attempt needs a new
challenge and will still fail at the nullifier check.

This order prevents a race where two requests both pass the duplicate check and then
both insert. In Redis, `SADD` is atomic and returns whether the member was new. In the
memory store, operations run on one event loop and are serialised.

## Revocation and reissue

The nullifier is tied to `credential_uid`. Reissuing a credential with a new
identifier produces a new nullifier, so the old nullifier no longer represents the
new credential.

There is no revocation list in this build. A production system needs one of:

- an issuer-signed status list committed to periodically;
- a revocation accumulator or Merkle tree whose root is a public input;
- an online issuer check, which weakens the offline privacy story.

The circuit does not prove that a credential is unrevoked.

## Linkability

Within one application, every use of one credential shares a nullifier. The
application can tell that the same credential returned, but it cannot learn the date
of birth, UID, or signature.

Across applications, nullifiers differ. An adversary that controls both applications
and knows that the same person holds one credential can correlate the two proofs by
timing or context even though the nullifier values differ. The protocol does not
claim strong unlinkability against colluding verifiers.

## Storage

| Backend | Challenge consume     | Nullifier insert  | Reset      |
| ------- | --------------------- | ----------------- | ---------- |
| Memory  | `Map` check and set   | `Set` add         | Delete set |
| Redis   | `SET key 1 NX EX ttl` | `SADD set member` | `DEL set`  |

Redis keys:

```text
aegis:challenge:<challenge id>
aegis:nullifiers:<app id>
```

The memory store is per process. Restarting the process forgets every nullifier and
challenge, which allows a credential to be used again. It is acceptable for a local
demo and not acceptable for a production verifier with more than one instance.

## Privacy limits

The nullifier is a deterministic pseudonym, not an anonymous token. It supports
rate-limiting and duplicate detection at the cost of linkability within an
application. If an application must not learn whether two proofs came from the same
credential, it should not store nullifiers at all; it then loses duplicate
protection.
