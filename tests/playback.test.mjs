import assert from 'node:assert/strict';
import { test } from 'node:test';
import { register } from 'node:module';

register('./typescript-loader.mjs', import.meta.url);
const { KhufuViewer } = await import('../src/scene/khufu.ts');

function viewerState() {
  const viewer = Object.create(KhufuViewer.prototype);
  viewer.progress = 0.456;
  viewer.flags = { mode: 'solid', playing: false, progress: 0.45, showEdges: true };
  viewer.applyProgress = (p) => { viewer.progress = p; };
  viewer.applyMode = () => { viewer.modeApplications++; };
  viewer.modeApplications = 0;
  viewer.controls = {};
  return viewer;
}

test('a progress report never rewinds the renderer when toggling settings', () => {
  const viewer = viewerState();
  viewer.setFlags({ progress: 0.45, playing: false });
  assert.equal(viewer.progress, 0.456);
});

test('unchanged edge setting does not rebuild scene mode', () => {
  const viewer = viewerState();
  viewer.built = { coreEdges: {}, casingEdges: {} };
  viewer.setFlags({ showEdges: true });
  assert.equal(viewer.modeApplications, 0);
});

test('explicit seek clamps progress and updates even a small jump', () => {
  const viewer = viewerState();
  viewer.setProgress(0.46);
  assert.equal(viewer.progress, 0.46);
  viewer.setProgress(2);
  assert.equal(viewer.progress, 1);
  viewer.setProgress(-1);
  assert.equal(viewer.progress, 0);
});

test('entering interior playback cannot restart the construction clock', () => {
  const viewer = viewerState();
  viewer.flags.mode = 'inside';
  viewer.setPlaying(true, 1);
  assert.equal(viewer.flags.playing, false);
});

test('a station selection interrupts exit with interior camera limits restored', () => {
  const viewer = viewerState();
  viewer.controls = { minDistance: 2, maxDistance: 260, maxPolarAngle: Math.PI * 0.495 };
  viewer.enterT = 1;
  viewer.enterAnim = { to: 0 };
  viewer.animateEnter = (to) => { viewer.enterAnim = { to }; };
  viewer.startPath = () => {};
  viewer.gotoStation(5);
  assert.equal(viewer.controls.minDistance, 0.35);
  assert.equal(viewer.controls.maxDistance, 60);
  assert.equal(viewer.controls.maxPolarAngle, Math.PI * 0.97);
  assert.equal(viewer.enterAnim.to, 1, 'a just-started exit fade must also be reversed');
});
