import assert from 'node:assert/strict';
import { register } from 'node:module';
import test from 'node:test';
import * as THREE from 'three';

register('./typescript-loader.mjs', import.meta.url);
const { buildBlockCourses, updateBlocks, HEIGHT } = await import('../src/scene/khufu.ts');

function makeSystem({ sloped = false, topDown = false, courses = 4, blocks = 2 } = {}) {
  return buildBlockCourses(
    new THREE.Group(), new THREE.MeshStandardMaterial(), courses,
    (y) => Math.max(0.05, 11.5 * (1 - y / HEIGHT)),
    0.055, 0.1, 0.9, topDown, blocks, 0.1,
    sloped ? Math.atan(11.5 / HEIGHT) : 0, sloped ? 0.26 : 0,
  );
}

function matrixAt(sys, course, block = 0) {
  const matrix = new THREE.Matrix4();
  sys.insts[course].getMatrixAt(block, matrix);
  return matrix;
}

test('upper-course stones remain above their final foundation throughout placement', () => {
  const sys = makeSystem();
  const course = 2;
  for (const fraction of [0.001, 0.1, 0.4, 0.75, 1]) {
    updateBlocks(sys, sys.starts[course][0] + sys.dur * fraction);
    const height = matrixAt(sys, course).elements[13];
    assert.ok(height >= sys.positions[course][1] - 1e-6, `foundation ${sys.positions[course][1]}, stone ${height}`);
    assert.ok(height <= sys.positions[course][1] + 0.08, 'placement is a short lowering motion');
  }
});

test('sloped faces retain orthogonal local axes during placement', () => {
  const sys = makeSystem({ sloped: true });
  const course = 2;
  const block = sys.blocksPerSide;
  updateBlocks(sys, sys.starts[course][block] + sys.dur * 0.3);
  const matrix = matrixAt(sys, course, block);
  const x = new THREE.Vector3().setFromMatrixColumn(matrix, 0);
  const y = new THREE.Vector3().setFromMatrixColumn(matrix, 1);
  const z = new THREE.Vector3().setFromMatrixColumn(matrix, 2);
  assert.ok(Math.abs(x.dot(y)) < 1e-6);
  assert.ok(Math.abs(y.dot(z)) < 1e-6, 'local-y scaling must scale its entire rotated basis column');
});

test('a stone becomes visible at the start of its placement, before half scale', () => {
  const sys = makeSystem();
  updateBlocks(sys, sys.starts[0][0] + sys.dur * 0.001);
  assert.equal(sys.insts[0].count, 1);
});

test('unstarted and completed courses do not upload unchanged GPU matrices', () => {
  const sys = makeSystem();
  const initial = sys.insts.map((mesh) => mesh.instanceMatrix.version);
  updateBlocks(sys, 0);
  assert.deepEqual(sys.insts.map((mesh) => mesh.instanceMatrix.version), initial);
  updateBlocks(sys, 1);
  const complete = sys.insts.map((mesh) => mesh.instanceMatrix.version);
  updateBlocks(sys, 0.99);
  assert.deepEqual(sys.insts.map((mesh) => mesh.instanceMatrix.version), complete);
});

test('course filters hide fills and restore them at identical progress without matrix uploads', () => {
  const sys = makeSystem();
  updateBlocks(sys, 1);
  const version = sys.insts[2].instanceMatrix.version;
  updateBlocks(sys, 1, (course) => course !== 2);
  assert.equal(sys.insts[2].count, 0);
  assert.equal(sys.fills[2].visible, false);
  assert.equal(sys.seams[2].visible, false);
  updateBlocks(sys, 1);
  assert.equal(sys.insts[2].count, sys.blocksPerSide * 4);
  assert.equal(sys.fills[2].visible, true);
  assert.equal(sys.insts[2].instanceMatrix.version, version);
});

test('reverse playback reproduces the same partially constructed geometry', () => {
  const sys = makeSystem({ sloped: true, topDown: true });
  const p = sys.starts[2][1] + sys.dur * 0.3;
  updateBlocks(sys, p);
  const expected = Array.from(sys.insts[2].instanceMatrix.array);
  const count = sys.insts[2].count;
  updateBlocks(sys, 1);
  updateBlocks(sys, p);
  assert.equal(sys.insts[2].count, count);
  assert.deepEqual(Array.from(sys.insts[2].instanceMatrix.array).slice(0, count * 16), expected.slice(0, count * 16));
  updateBlocks(sys, 0);
  assert.ok(sys.insts.every((mesh) => mesh.count === 0));
  assert.ok(sys.fills.every((mesh) => !mesh.visible));
});

test('normal-size construction reserves a visible settling interval and finishes on schedule', () => {
  const sys = makeSystem({ courses: 40, blocks: 8 });
  assert.ok(sys.dur >= 0.012, 'stone placement needs multiple frames during accelerated playback');
  const lastStart = Math.max(...sys.starts.map((course) => course.at(-1)));
  assert.ok(lastStart + sys.dur <= 0.900001);
});

test('course culling bounds cover every stone before animation begins', () => {
  const sys = makeSystem();
  const mesh = sys.insts[2];
  assert.ok(mesh.boundingSphere, 'bounds must not be captured from the first partially visible stone');
  updateBlocks(sys, 1);
  const position = new THREE.Vector3();
  for (let block = 0; block < mesh.count; block++) {
    position.setFromMatrixPosition(matrixAt(sys, 2, block));
    assert.ok(mesh.boundingSphere.containsPoint(position));
  }
});
