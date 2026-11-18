/** The credential does not satisfy the circuit, so no proof can exist for it. */
export class CircuitRejection extends Error {
  constructor() {
    super("The credential does not satisfy the proof rules.");
    this.name = "CircuitRejection";
  }
}

/**
 * Generates a proof in a dedicated worker. The worker is discarded afterwards,
 * which releases the memory the prover used.
 *
 * @param {object} input Circuit input signals
 * @returns {Promise<{ proof: object, publicSignals: string[] }>}
 */
export function generateProof(input) {
  return new Promise((resolve, reject) => {
    const worker = new Worker("/js/prover-worker.js");

    worker.onmessage = ({ data }) => {
      worker.terminate();
      if (data.ok) {
        resolve(data.result);
      } else if (data.rejected) {
        reject(new CircuitRejection());
      } else {
        reject(new Error(data.message));
      }
    };
    worker.onerror = (event) => {
      worker.terminate();
      reject(new Error(event.message || "The prover could not start."));
    };

    worker.postMessage({ input });
  });
}
