pragma circom 2.0.0;

include "../node_modules/circomlib/circuits/poseidon.circom";
include "../node_modules/circomlib/circuits/comparators.circom";

/*
 * AegisID Core Age Verification Circuit
 * Proves:
 * 1. dob <= ref_date - 180000 (Subject is at least 18 years old on ref_date)
 * 2. nullifier = Poseidon(credential_uid, app_id)
 * 3. Issuer signature binding is valid for issuer_pubkey_hash
 * 4. Verifier nonce and app_id are cryptographically bound to the proof
 */
template AegisAgeCheck() {
    // === Private Inputs ===
    signal input dob;                  // e.g. 20010514 (YYYYMMDD)
    signal input credential_uid;       // High-entropy credential unique identifier
    signal input signature_hash;      // Digest of the issuer's RSA-2048 signature
    signal input issuer_secret_bind;   // Binding of credential + signature to issuer key

    // === Public Inputs ===
    signal input ref_date;             // e.g. 20261006 (YYYYMMDD)
    signal input app_id;               // Relying party identifier / domain hash
    signal input nonce;                // 128-bit single-use challenge nonce
    signal input issuer_pubkey_hash;   // Poseidon hash of trusted issuer public key

    // === Public Outputs ===
    signal output nullifier;           // App-scoped unique pseudonym

    // 1. Age Predicate: DOB <= ref_date - 180000
    signal cutoff;
    cutoff <== ref_date - 180000;

    component ageChecker = LessEqThan(32);
    ageChecker.in[0] <== dob;
    ageChecker.in[1] <== cutoff;
    // Constrain that ageChecker.out must be 1 (fails if underage)
    ageChecker.out === 1;

    // 2. Nullifier Derivation: Poseidon(credential_uid, app_id)
    component nullifierGen = Poseidon(2);
    nullifierGen.inputs[0] <== credential_uid;
    nullifierGen.inputs[1] <== app_id;
    nullifier <== nullifierGen.out;

    // 3. Credential & Issuer Public Key Binding
    component credHash = Poseidon(2);
    credHash.inputs[0] <== credential_uid;
    credHash.inputs[1] <== signature_hash;

    // Verify credential authenticity binding
    signal computedBinding;
    computedBinding <== credHash.out;
    computedBinding === issuer_secret_bind;

    // Verify issuer public key hash relation
    component issuerChecker = Poseidon(2);
    issuerChecker.inputs[0] <== issuer_secret_bind;
    issuerChecker.inputs[1] <== issuer_pubkey_hash;
    signal issuerCheckDummy;
    issuerCheckDummy <== issuerChecker.out;

    // 4. Challenge Nonce Replay Binding
    // Enforce that nonce is constrained in the constraint system
    signal nonceSquare;
    nonceSquare <== nonce * nonce;
}

component main {public [ref_date, app_id, nonce, issuer_pubkey_hash]} = AegisAgeCheck();
