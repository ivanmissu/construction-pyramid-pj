# Pyramid realism and workforce implementation plan

**Goal:** Improve the modern Khufu silhouette, remove the completion fade's rendering discontinuity, and communicate construction manpower through a larger working site.

**Architecture:** Keep the present-day stonework in a separate instanced model, controlled by the existing view mode. Keep workers and site props deterministic on the construction timeline. Retain one render loop and stable material compositing during completion.

**Tech stack:** Existing React, TypeScript and Three.js; no new runtime dependencies.

- [x] Modern exterior: `src/scene/todayExterior.ts`, with uneven weathered courses, truncated 137.5 m summit, warm limestone, north entrance scar, and small casing remnants at the foot. Integrate visibility in `src/scene/khufu.ts`. Verify dimensions, deterministic geometry and opaque mass in `tests/todayExterior.test.mjs`.
- [x] Completion transition: first reproduce the opacity/depth/render-order discontinuity in `tests/finishTransition.test.mjs`; keep shell and core in stable blending layers throughout the fade and bring AO in gradually. Verify completion, interruption and reverse transition.
- [x] Workforce: expand `src/scene/workers.ts` to 216 illustrative workers in coordinated hauling, carrying, masonry and support groups, with shelters, storage and logistics props. Keep perimeter routes outside the excavation, limited instanced batches, and paused/reversible animation; verify these in `tests/workers.test.mjs`.
- [x] Run `npm test`, `npm run typecheck`, `npm run build`, and `git diff --check`; visually inspect modern, original, translucent and construction close-up views in the local browser.

References: [Egypt Ministry: Khufu](https://egymonuments.gov.eg/monuments/the-great-pyramid/), [Egypt Ministry: Khafre](https://egymonuments.gov.eg/monuments/pyramid-complex-of-khafre-khefren/), and referenced photographs of Khufu core blocks. The contemporary model is an interpretive reconstruction, not a surveyed stone-by-stone scan. Construction figures communicate scale, not an exact historic headcount.

Validation: 41 regression tests pass; typecheck, production build and diff whitespace checks pass. Browser checks cover the present-day silhouette, translucent and complete exterior states, and both worksite camera presets. Legacy quarry stones now sit in two rear supply yards, clear of all sampled crew and sled paths. Workforce uses 14 instanced batches (8 moving, 6 static). The fill-opacity curve prevents stacked course caps from obscuring translucent interiors; AO waits for the actual fill opacity before fading in.
