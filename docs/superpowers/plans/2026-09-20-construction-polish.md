# Construction animation and lighting polish

**Goal:** Make the Khufu construction simulation continuous, responsive, and visually grounded while keeping the existing views and data.

**Architecture:** Keep Three.js in charge of the animation clock; React receives throttled progress reports and sends explicit seek commands. Update only active stone courses. Isolate realtime postprocessing and environment lighting in a disposable render pipeline.

**Tech Stack:** React 19, Three.js 0.186, TypeScript, Vite. No new runtime dependencies.

## Implementation

- [x] Fix course-local transforms, smooth short placement motion, reverse seeks, and settled-layer caching. Verify matrices, visibility, and upload counts with Node tests.
- [x] Add three rendering presets, filtered contact shadows, correctly ordered color output and antialiasing, plus a procedural desert reflection environment.
- [x] Fix playback completion, explicit seeks, frame-independent camera/fade motion, hidden-tab timing, pointer interruption, and cleanup.
- [x] Add accessible quality/playback controls and reduced-motion defaults.
- [x] Add 28 construction workers in hauling, carrying, and stoneworking groups. Drive all motion from the construction timeline and provide a close-up camera control.
- [x] Run TypeScript, production build, regression tests, and browser checks of construction, scrubbing, completed exterior, quality changes, and interior views.

## Visual direction

Retain the existing warm stone, gold capstone, blue desert sky, and compact dark controls. Keep highlights restrained, add subtle stone roughness, and preserve readable internal structures during construction. The real-time effects are described as enhanced lighting; the WebGL pipeline does not perform path tracing.

## Verification criteria

Stones stay anchored at their course height and end at exact authored transforms. Rewinding and switching view modes restore visibility correctly. Completed courses do not upload unchanged matrices. Paused progress stays stable when changing quality, labels, or speed. Playback stops at 100% and restarts with one action. Background-tab time does not skip construction. Rendering resources and input listeners are released on disposal.

## Validation results

- 29 automated regression tests pass; TypeScript and the production build pass.
- Browser checks cover pause and replay, timeline seeks, three quality presets, exterior and interior views, and the construction crew close-up. No browser warnings or errors were observed in the final preview.
- 28 workers use eight instanced rendering batches; all poses are derived from timeline progress.
- Completed-course caching reduced matrix uploads from 57,640 to 1,399 over 1,441 sampled progress values (97.6% fewer uploads; not an FPS measurement).
- Additional visual fixes: properly scaled/aligned passage geometry with open segment ends, grounded quarry stones, and interior camera/light adjustments for narrow passages.
