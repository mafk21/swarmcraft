# Contributing

Thanks for looking. This is a small project with one non-negotiable rule, so
please read that first.

## The rule that cannot be broken

**The model must never write CSS.**

`SiteSpecSchema` in `src/lib/spec.ts` is `.strict()` and has no field for a colour,
a size, a class or a style. A model that invents one has it stripped. Adding a
styling field, even an innocuous one, changes what the product *is*: it stops being
"the worst output is plain" and becomes "the worst output is whatever the model felt
like". If you think a visual capability is missing, add a **hand-built theme**
(`src/lib/themes.ts`) or a token, not a model-facing field.

The rest of the doctrine is in [docs/BUILD-PLAN.md](docs/BUILD-PLAN.md): no gradients,
no glassmorphism, no emoji, no sparkles, no centred hero over three identical cards.

## Getting set up

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # 27 suites, browserless, no key needed
npm run doctor     # are the safety nets still in place?
```

Node 22.12+. You do not need an API key to develop or to run the tests —
the suite stubs the network. You do need one to click through a real build.

## What a good change looks like here

1. **Fix things in order.** One concern per pull request. This repository's history
   is a list of rounds, not a pile of mixed commits.
2. **A fix counts only once a test fails without it.** Every bug fixed so far has a
   suite that exists for that bug — see the table in the README. If you cannot make
   the test fail by reverting your change, the test is not testing your change.
3. **Never claim something works when only a stub was tested.** Say what you
   actually verified. The README is explicit about what has and has not been seen in
   a real browser; keep it that way.
4. **Do not widen a promise.** The build budget is 80 seconds and `npm test` fails if
   it is raised above 90. Do not add an unbounded wait anywhere: every stage needs a
   deadline, and there is a module-level backstop for the ones you forget.

## Style

- TypeScript strict; `npm run typecheck` must pass.
- Comments explain **why**, especially when the obvious code is wrong. The code here
  is full of "this used to do X and it cost a user 518 seconds" — that is
  deliberate. Keep it.
- No new runtime dependencies without a strong reason. The app has six, and the
  whole point is that it runs locally with no server.

## Reporting a bug

Include the build stamp from the bottom of the first screen (`build abc1234`). If it
does not match `main`, the checkout is stale and that is the answer more often than
anything else. Say what you did, what you expected, and what happened — and whether
it involved a real API key or the app's own stubbed paths.

## Licensing of contributions

By opening a pull request you agree your contribution is licensed under the
repository's terms: MIT for the code, with the animation-choreography caveat in
[NOTICE](../NOTICE) applying. Do not paste in code from another project unless its
license permits it and you say so in the PR.
