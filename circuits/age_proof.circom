pragma circom 2.0.0;

include "../node_modules/circomlib/circuits/poseidon.circom";
include "../node_modules/circomlib/circuits/comparators.circom";
include "../node_modules/circomlib/circuits/eddsaposeidon.circom";

// Proves, for a credential signed by a trusted issuer:
//   1. the EdDSA signature covers the age, holder, KYC status, and expiry;
//   2. Poseidon(issuer_ax, issuer_ay) equals issuer_key_hash;
//   3. dob <= ref_date - 180000 (YYYYMMDD encoding);
//   4. the issuer marked KYC complete and the credential has not expired;
//   5. nullifier = Poseidon(credential_uid, app_id);
//   6. nonce is part of the R1CS so the proof is bound to it.
//
// The issuer public key (ax, ay) is private. Only its Poseidon hash is
// public. A verifier accepts the proof only if that hash is on its trusted
// issuer list.
template AgeProof() {
    // Credential fields. These never leave the prover.
    signal input dob;
    signal input credential_uid;
    signal input kyc_verified;
    signal input expires_at;
    signal input issuer_ax;
    signal input issuer_ay;
    signal input signature_r8x;
    signal input signature_r8y;
    signal input signature_s;

    // Verifier-provided context.
    signal input ref_date;
    signal input app_id;
    signal input nonce;
    signal input issuer_key_hash;

    // App-scoped pseudonym.
    signal output nullifier;

    // 1. The message the issuer signed.
    component message = Poseidon(4);
    message.inputs[0] <== dob;
    message.inputs[1] <== credential_uid;
    message.inputs[2] <== kyc_verified;
    message.inputs[3] <== expires_at;

    // 2. EdDSA-Poseidon verification over BabyJubjub.
    // The component has no output; with enabled = 1 it constrains
    // S*B8 == R8 + h*8*A internally.
    component signature = EdDSAPoseidonVerifier();
    signature.enabled <== 1;
    signature.Ax <== issuer_ax;
    signature.Ay <== issuer_ay;
    signature.S <== signature_s;
    signature.R8x <== signature_r8x;
    signature.R8y <== signature_r8y;
    signature.M <== message.out;

    // Only credentials attested as KYC-complete and valid on the request date pass.
    kyc_verified === 1;
    component credentialExpiry = GreaterEqThan(32);
    credentialExpiry.in[0] <== expires_at;
    credentialExpiry.in[1] <== ref_date;
    credentialExpiry.out === 1;

    // 3. Bind the signing key to the trusted issuer hash.
    component keyHash = Poseidon(2);
    keyHash.inputs[0] <== issuer_ax;
    keyHash.inputs[1] <== issuer_ay;
    keyHash.out === issuer_key_hash;

    // 4. Age predicate. 180000 is 18 years in YYYYMMDD space, so
    // cutoff is the same month and day 18 years before ref_date.
    // Reject impossible reference dates so cutoff cannot wrap.
    component refDateFloor = GreaterEqThan(32);
    refDateFloor.in[0] <== ref_date;
    refDateFloor.in[1] <== 180000;
    refDateFloor.out === 1;

    signal cutoff;
    cutoff <== ref_date - 180000;

    component age = LessEqThan(32);
    age.in[0] <== dob;
    age.in[1] <== cutoff;
    age.out === 1;

    // 5. Nullifier: deterministic per credential per application.
    component nullifierGen = Poseidon(2);
    nullifierGen.inputs[0] <== credential_uid;
    nullifierGen.inputs[1] <== app_id;
    nullifier <== nullifierGen.out;

    // 6. Keep nonce in the constraint system. Groth16 already binds
    // public inputs to the proof; this prevents the signal from being
    // dropped as unused.
    signal nonceSquare;
    nonceSquare <== nonce * nonce;
}

component main {public [ref_date, app_id, nonce, issuer_key_hash]} = AgeProof();
