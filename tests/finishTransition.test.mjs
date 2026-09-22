import assert from 'node:assert/strict';
import { test } from 'node:test';
import { register } from 'node:module';
register('./typescript-loader.mjs', import.meta.url);
const { KhufuViewer, buildModel } = await import('../src/scene/khufu.ts');

function fadingViewer() {
  return Object.assign(Object.create(KhufuViewer.prototype), {
    built: buildModel(), flags: { mode: 'solid', showLabels: true, rayTracing: true },
    progress: 1, enterT: 0, reducedMotion: false,
    casingOpCur: 0.1, coreOpCur: 0.085, emissiveCur: 0.95,
    plugOpCur: 0, pitOpCur: 1, plateauOpCur: 0, seamOpCur: 0.18,
    labelOpCur: 1, innerOpCur: 1, innerOpApplied: -1, emissiveApplied: -1,
    fadeSettled: false, renderer: { shadowMap: {} },
  });
}

test('finishing opacity never switches render queues or depth policy at the last frame', () => {
  const viewer = fadingViewer();
  let initial;
  let previous = 0.1;
  let sawIntermediate = false;
  for (let frame = 0; frame < 240; frame++) {
    viewer.updateFinishFade(1 / 60);
    const { casingMat: material, casingSys, coreSys } = viewer.built;
    const state = [material.transparent, material.depthWrite, ...casingSys.insts.map(m => m.renderOrder), ...casingSys.fills.map(m => m.renderOrder)];
    initial ??= state;
    assert.deepEqual(state, initial, 'reordering near opacity=1 causes the visible final-frame pop');
    assert.ok(material.opacity >= previous && material.opacity - previous < 0.06);
    sawIntermediate ||= material.opacity > 0.3 && material.opacity < 0.8;
    previous = material.opacity;
    assert.equal(coreSys.insts[0].renderOrder, coreSys.fills[0].renderOrder, 'fill and face stone use the same compositing layer');
  }
  assert.ok(sawIntermediate);
  assert.equal(viewer.built.casingMat.opacity, 1);
});

test('a reversed mode fade continues from the current opacity', () => {
  const viewer = fadingViewer();
  for (let frame = 0; frame < 25; frame++) viewer.updateFinishFade(1 / 60);
  const before = viewer.built.casingMat.opacity;
  viewer.flags.mode = 'translucent';
  viewer.updateFinishFade(1 / 60);
  assert.ok(viewer.built.casingMat.opacity < before);
  assert.ok(viewer.built.casingMat.opacity > before - 0.05);
  viewer.flags.mode = 'solid';
  const reverse = viewer.built.casingMat.opacity;
  viewer.updateFinishFade(1 / 60);
  assert.ok(viewer.built.casingMat.opacity > reverse);
  assert.ok(viewer.built.casingMat.opacity < reverse + 0.05);
});

test('AO waits for the shell depth pass and then blends in with continuous opacity', () => {
  const viewer = fadingViewer();
  const amounts = [];
  viewer.pipeline = { render: value => amounts.push(value.ambientOcclusion) };
  for (const opacity of [0.98, 0.989, 0.99, 0.992, 0.995, 0.998, 1]) {
    viewer.casingOpCur = viewer.coreOpCur = opacity;
    viewer.renderFrame();
  }
  assert.equal(amounts[0], 0);
  assert.equal(amounts[2], 0);
  assert.ok(amounts[4] > 0 && amounts[4] < 1);
  assert.equal(amounts.at(-1), 1);
});
