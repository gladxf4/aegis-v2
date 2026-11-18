# Third-party notices

AegisID depends on the following projects. Versions are pinned in
`package.json` and `package-lock.json`.

| Component                                           | Version | Licence | Use                              |
| --------------------------------------------------- | ------- | ------- | -------------------------------- |
| [snarkjs](https://github.com/iden3/snarkjs)         | 0.7.6   | GPL-3.0 | Groth16 proving and verification |
| [circomlib](https://github.com/iden3/circomlib)     | 2.0.5   | GPL-3.0 | Poseidon, EdDSA, comparators     |
| [circomlibjs](https://github.com/iden3/circomlibjs) | 0.1.7   | GPL-3.0 | Issuer signing and fixtures      |
| [circom](https://github.com/iden3/circom)           | 2.2.x   | GPL-3.0 | Circuit compiler (external tool) |
| [express](https://github.com/expressjs/express)     | 5.2.1   | MIT     | Local development server         |
| [ajv](https://github.com/ajv-validator/ajv)         | 8.17.1  | MIT     | Benchmark schema validation      |

`app/vendor/snarkjs.min.js` is the unmodified browser bundle from the snarkjs
package. Its licence text is shipped alongside it as
`app/vendor/snarkjs.COPYING`. Redistributing that bundle means complying with
GPL-3.0 for that file.

The circuit includes Circomlib templates, which carry the same GPL-3.0 terms.
Keep the upstream notices when redistributing the compiled artifacts.
