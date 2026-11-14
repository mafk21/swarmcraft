## What

<!-- One paragraph. What changes, and why. -->

## Why

<!-- The bug or the gap. Link the issue if there is one. -->

## Verification

<!--
  Be specific and be honest. "Tests pass" is not verification on its own.
  Delete lines that do not apply.
-->

- [ ] `npm test` — which suites, and did any of them fail without this change?
- [ ] The fix is proven by **reverting it** and watching a test fail. Name the test.
- [ ] Seen working in a real browser (say which), or explicitly **not** seen.
- [ ] If this touches the build pipeline: the 80s budget still holds.

## Doctrine check

- [ ] The model still cannot write CSS — no styling fields added to the schema
- [ ] No new unbounded waits; every stage still has a deadline
- [ ] No gradients, glassmorphism, emoji, sparkles
