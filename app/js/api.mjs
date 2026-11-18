import { isSignedCredential } from "./credential.mjs";

async function requestJson(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: { Accept: "application/json", ...options.headers }
  });
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch (error) {
    body = { error: "BAD_RESPONSE", message: "The server returned an unreadable response." };
  }
  return { ok: response.ok, status: response.status, body };
}

function failureMessage({ status, body }, fallback) {
  const retryAfter = Number(body?.retry_after_seconds);
  const suffix = retryAfter > 0 ? ` Retry in ${retryAfter}s.` : "";
  return body?.message ? `${body.message}${suffix}` : `${fallback} (${status}).`;
}

export async function fetchChallenge() {
  const response = await requestJson("/api/challenge");
  if (!response.ok) {
    throw new Error(failureMessage(response, "Challenge request failed"));
  }
  return response.body;
}

export async function fetchDemoSample(excludeUid) {
  const query = excludeUid ? `?${new URLSearchParams({ exclude: excludeUid })}` : "";
  const response = await requestJson(`/api/demo-sample${query}`);
  if (!response.ok || !isSignedCredential(response.body?.credential)) {
    throw new Error(failureMessage(response, "A fresh sample is unavailable"));
  }
  return response.body.credential;
}

export async function fetchFixtures() {
  const response = await requestJson("/credentials.json");
  if (!response.ok || !Array.isArray(response.body?.credentials)) {
    throw new Error("Could not load the test credentials.");
  }
  return response.body.credentials;
}

/** Returns the health report, including the 503 report of an unready verifier. */
export async function fetchHealth() {
  const { body } = await requestJson("/api/health");
  if (typeof body?.ok !== "boolean") {
    throw new Error("Could not read verifier status.");
  }
  return body;
}

export function submitProof(token, { proof, publicSignals }) {
  return requestJson("/api/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, proof, publicSignals })
  });
}

/** @returns {Promise<boolean>} False when this deployment has reset disabled */
export async function resetNullifiers() {
  const response = await requestJson("/api/reset", { method: "POST" });
  if (response.status === 404) {
    return false;
  }
  if (!response.ok) {
    throw new Error(failureMessage(response, "Reset failed"));
  }
  return true;
}
