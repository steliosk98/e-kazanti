# e-Kazanti

Online recreation of **Kazantí (Καζαντί)**, the Cypriot street "casino": a spring-launched steel ball
drops through a tilted board of nails and settles between two of them; the number printed in that gap wins.

Play: https://steliosk98.github.io/e-kazanti/

- **Cards** — 10 tombola-style cards, 9 numbers each, together covering 1–90. Ball lands on your number → hit.
- **Digit** — pick 1–9, win when the number ends in it (7 → 7, 17, 27 … 87).
- **Leverage** — shoot up to 4 balls per round; every ball is scored against every bet.
- Virtual credits only. 1 credit per bet per ball, a hit pays 10.

The outcome is real 2D physics (gravity, nail collisions, rails, ball-on-ball) — no hidden RNG picks the number.
Static site, no build step. `node test.mjs` runs a Monte Carlo check that every ball settles on a numbered gap
and that no card/digit is systematically favoured.
