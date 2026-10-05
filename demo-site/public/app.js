// AegisID Client Application Script

let currentChallenge = null;
let currentPersonas = [];
let selectedPersona = null;
let generatedProofData = null;
let countdownTimer = null;

// DOM References
const challengeQr = document.getElementById("challengeQr");
const dispNonce = document.getElementById("dispNonce");
const dispRefDate = document.getElementById("dispRefDate");
const dispCountdown = document.getElementById("dispCountdown");
const btnNewChallenge = document.getElementById("btnNewChallenge");

const statusNotice = document.getElementById("statusNotice");
const statusBadge = document.getElementById("statusBadge");
const statusTitle = document.getElementById("statusTitle");
const statusDesc = document.getElementById("statusDesc");
const dispNullifier = document.getElementById("dispNullifier");
const dispPredicate = document.getElementById("dispPredicate");
const btnResetNullifiers = document.getElementById("btnResetNullifiers");

const personaChips = document.getElementById("personaChips");
const cardName = document.getElementById("cardName");
const cardDob = document.getElementById("cardDob");
const cardNum = document.getElementById("cardNum");

const btnProve = document.getElementById("btnProve");
const btnSubmitProof = document.getElementById("btnSubmitProof");
const step1 = document.getElementById("step1");
const step2 = document.getElementById("step2");
const step3 = document.getElementById("step3");
const step4 = document.getElementById("step4");

const dispProvingTime = document.getElementById("dispProvingTime");
const dispVerifyTime = document.getElementById("dispVerifyTime");

// 1. Fetch Challenge Session
async function fetchNewChallenge() {
  try {
    const res = await fetch("/api/challenge");
    currentChallenge = await res.json();

    challengeQr.src = currentChallenge.qr_data_url;
    dispNonce.innerText = currentChallenge.nonce.slice(0, 10) + "..." + currentChallenge.nonce.slice(-8);
    dispNonce.title = currentChallenge.nonce;
    dispRefDate.innerText = currentChallenge.ref_date;

    // Reset status box
    statusNotice.className = "notice-box pending";
    statusBadge.innerText = "PENDING";
    statusTitle.innerText = "Awaiting Zero-Knowledge Proof";
    statusDesc.innerText = "Scan challenge QR with the mobile wallet or dispatch a proof from the client terminal.";
    dispNullifier.innerText = "Pending proof";
    dispPredicate.innerText = "Unverified";
    dispPredicate.style.color = "var(--text-muted)";

    // Reset proof state
    generatedProofData = null;
    btnSubmitProof.disabled = true;
    resetPipeline();

    startCountdown(currentChallenge.expires_at);
  } catch (err) {
    console.error("Failed to fetch challenge:", err);
  }
}

function resetPipeline() {
  [step1, step2, step3, step4].forEach((s, idx) => {
    s.className = "pipeline-item";
    if (idx === 0) s.innerText = "[1] Witness synthesis from raw credential payload";
    if (idx === 1) s.innerText = "[2] Evaluate predicate: DOB <= ref_date - 180000";
    if (idx === 2) s.innerText = "[3] Derive scoped nullifier: Poseidon(uid, app_id)";
    if (idx === 3) s.innerText = "[4] Groth16 multi-scalar multiplication (alt_bn128)";
  });
}

// 2. Countdown Timer
function startCountdown(expiresAt) {
  if (countdownTimer) clearInterval(countdownTimer);
  countdownTimer = setInterval(() => {
    const remaining = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
    const mins = String(Math.floor(remaining / 60)).padStart(2, "0");
    const secs = String(remaining % 60).padStart(2, "0");
    dispCountdown.innerText = `${mins}:${secs}`;
    if (remaining <= 0) {
      clearInterval(countdownTimer);
      statusNotice.className = "notice-box rejected";
      statusBadge.innerText = "EXPIRED";
      statusTitle.innerText = "Challenge Nonce Expired";
      statusDesc.innerText = "The 5-minute single-use session window has elapsed. Generate a new challenge to proceed.";
    }
  }, 1000);
}

// 3. Load Personas
async function loadPersonas() {
  try {
    const res = await fetch("/api/personas");
    currentPersonas = await res.json();

    personaChips.innerHTML = "";
    currentPersonas.forEach((p, idx) => {
      const btn = document.createElement("button");
      btn.className = `tab-btn ${idx === 0 ? "active" : ""}`;
      btn.innerText = `${p.name} (Age ${p.age})`;
      btn.onclick = () => selectPersona(p, btn);
      personaChips.appendChild(btn);
    });

    if (currentPersonas.length > 0) {
      selectPersona(currentPersonas[0], personaChips.children[0]);
    }
  } catch (err) {
    console.error("Failed to load personas:", err);
  }
}

function selectPersona(persona, tabElement) {
  selectedPersona = persona;
  document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
  if (tabElement) tabElement.classList.add("active");

  cardName.innerText = persona.name;
  cardDob.innerText = `${persona.dob} (Age ${persona.age})`;
  cardNum.innerText = persona.maskedAadhaar;

  // Reset proof state on persona switch
  generatedProofData = null;
  btnSubmitProof.disabled = true;
  resetPipeline();
}

// 4. Client Proof Generation
btnProve.onclick = async () => {
  if (!currentChallenge || !selectedPersona) return;

  btnProve.disabled = true;
  btnSubmitProof.disabled = true;
  resetPipeline();

  step1.className = "pipeline-item active";
  step1.innerText = "[1] Synthesizing private witness...";
  await sleep(100);
  step1.className = "pipeline-item success";
  step1.innerText = "[1] Witness synthesized successfully";

  step2.className = "pipeline-item active";
  step2.innerText = `[2] Evaluating R1CS age constraint (DOB: ${selectedPersona.dobInt} <= Cutoff)...`;
  await sleep(100);

  try {
    const res = await fetch("/api/prover/prove", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        personaId: selectedPersona.id,
        challengeId: currentChallenge.challenge_id
      })
    });

    const data = await res.json();

    if (!data.success) {
      step2.className = "pipeline-item fail";
      step2.innerText = "[2] CONSTRAINT UNSATISFIED: Subject age < 18 or signature invalid";

      statusNotice.className = "notice-box rejected";
      statusBadge.innerText = "PROVER_REJECT";
      statusTitle.innerText = "Circuit Constraints Unsatisfied";
      statusDesc.innerText = data.details || data.error;

      btnProve.disabled = false;
      return;
    }

    step2.className = "pipeline-item success";
    step2.innerText = "[2] Predicate satisfied: age >= 18 confirmed";

    step3.className = "pipeline-item success";
    step3.innerText = "[3] Scoped nullifier derived: Poseidon(uid, app_id)";

    step4.className = "pipeline-item success";
    step4.innerText = "[4] Groth16 proof computed (alt_bn128, 256 bytes)";

    generatedProofData = data;
    dispProvingTime.innerText = `${data.proverLatencyMs} ms`;

    btnSubmitProof.disabled = false;
    btnProve.disabled = false;

  } catch (err) {
    console.error("Prover error:", err);
    btnProve.disabled = false;
  }
};

// 5. Submit Proof to Verifier
btnSubmitProof.onclick = async () => {
  if (!generatedProofData || !currentChallenge) return;

  btnSubmitProof.disabled = true;

  statusNotice.className = "notice-box pending";
  statusBadge.innerText = "VERIFYING";
  statusTitle.innerText = "Checking Groth16 Proof On-Chain / Server...";
  statusDesc.innerText = "Computing pairing equations e(A, B) = e(alpha, beta) * e(x, gamma) * e(C, delta)...";

  await sleep(150);

  try {
    const res = await fetch("/api/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        challenge_id: currentChallenge.challenge_id,
        proof: generatedProofData.proof,
        publicSignals: generatedProofData.publicSignals
      })
    });

    const result = await res.json();

    if (result.verified) {
      statusNotice.className = "notice-box verified";
      statusBadge.innerText = "VERIFIED";
      statusTitle.innerText = "Access Granted: Subject Age >= 18 Confirmed";
      statusDesc.innerText = `Proof cryptographically valid. Zero identity data revealed to the relying party.`;

      dispNullifier.innerText = result.nullifier.slice(0, 10) + "..." + result.nullifier.slice(-8);
      dispNullifier.title = result.nullifier;
      dispPredicate.innerText = "Satisfied (age >= 18)";
      dispPredicate.style.color = "var(--accent-green)";
      dispVerifyTime.innerText = `${result.verifyLatencyMs} ms`;
    } else {
      statusNotice.className = "notice-box rejected";
      statusBadge.innerText = "REJECTED";
      statusTitle.innerText = "Access Denied";
      statusDesc.innerText = result.reason || "Proof verification failed.";

      dispPredicate.innerText = "Rejected";
      dispPredicate.style.color = "var(--accent-red)";
    }
  } catch (err) {
    console.error("Verification error:", err);
  }
};

// 6. Reset Nullifiers
btnResetNullifiers.onclick = async () => {
  await fetch("/api/reset-nullifiers", { method: "POST" });
  dispNullifier.innerText = "Cleared";
};

btnNewChallenge.onclick = () => {
  fetchNewChallenge();
};

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Initial Boot
fetchNewChallenge();
loadPersonas();
