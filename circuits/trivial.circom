pragma circom 2.0.0;

/*
 * M0 Feasibility Test Circuit
 * Proves knowledge of private factors a and b such that a * b = c.
 */
template TrivialMultiplier() {
    signal input a;
    signal input b;
    signal output c;

    c <== a * b;
}

component main {public [a]} = TrivialMultiplier();
