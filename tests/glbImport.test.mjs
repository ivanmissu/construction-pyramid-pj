import assert from 'node:assert/strict';
import { test } from 'node:test';
import { register } from 'node:module';
import * as THREE from 'three';
register('./typescript-loader.mjs', import.meta.url);
const { KhufuViewer } = await import('../src/scene/khufu.ts');

// Small, self-contained glTF fixture: a 230 m building, 2600 m terrain,
// and a scale animation. No Blender installation or generated file is needed.
function modelFile({ named = true } = {}) {
  const values = new Float32Array([
    -115, 0, -115, 115, 0, 115, 0, 146.6, 0,
    -1300, -3, -1300, 1300, -3, 1300, -1300, -3, 1300,
    0, 20, 0.000001, 0.000001, 0.000001, 1, 1, 1,
  ]);
  const json = {
    asset: { version: '2.0' }, scene: 0,
    scenes: [{ nodes: [0, 1], extras: named ? { khufu_generator: 'construction-pyramid-v1' } : {} }],
    nodes: [{ name: named ? '石核_层40' : 'Building', mesh: 0 }, { name: '沙漠地表', mesh: 1 }],
    meshes: [0, 1].map(i => ({ primitives: [{ attributes: { POSITION: i } }] })),
    buffers: [{ byteLength: values.byteLength }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: 36 }, { buffer: 0, byteOffset: 36, byteLength: 36 },
      { buffer: 0, byteOffset: 72, byteLength: 8 }, { buffer: 0, byteOffset: 80, byteLength: 24 },
    ],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 3, type: 'VEC3', min: [-115, 0, -115], max: [115, 146.6, 115] },
      { bufferView: 1, componentType: 5126, count: 3, type: 'VEC3', min: [-1300, -3, -1300], max: [1300, -3, 1300] },
      { bufferView: 2, componentType: 5126, count: 2, type: 'SCALAR', min: [0], max: [20] },
      { bufferView: 3, componentType: 5126, count: 2, type: 'VEC3' },
    ],
    animations: [{ name: 'Build', channels: [{ sampler: 0, target: { node: 0, path: 'scale' } }], samplers: [{ input: 2, output: 3 }] }],
  };
  const raw = Buffer.from(JSON.stringify(json));
  const text = Buffer.alloc(Math.ceil(raw.length / 4) * 4, 32); raw.copy(text);
  const bytes = Buffer.alloc(12 + 8 + text.length + 8 + values.byteLength);
  bytes.writeUInt32LE(0x46546c67, 0); bytes.writeUInt32LE(2, 4); bytes.writeUInt32LE(bytes.length, 8);
  bytes.writeUInt32LE(text.length, 12); bytes.writeUInt32LE(0x4e4f534a, 16); text.copy(bytes, 20);
  bytes.writeUInt32LE(values.byteLength, 20 + text.length); bytes.writeUInt32LE(0x004e4942, 24 + text.length);
  Buffer.from(values.buffer).copy(bytes, 28 + text.length);
  return { arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) };
}

function viewer() {
  const camera = new THREE.PerspectiveCamera(48, 1.5, 0.006, 1300);
  camera.position.set(46, 22, 40);
  return Object.assign(Object.create(KhufuViewer.prototype), {
    camera, glbGroup: new THREE.Group(), mixer: null, glbActions: [], glbCameraState: null,
    built: { root: new THREE.Group() }, flags: { autoCamera: true, autoRotate: true, showLabels: true },
    controls: { target: new THREE.Vector3(0, 6, 0), minDistance: 2, maxDistance: 260, maxPolarAngle: 1.55, autoRotate: true, update() {} },
    renderer: { shadowMap: {} }, applyMode() {}, onCameraControl() {}, progress: 0,
  });
}

test('import frames the completed building instead of the 2600 m desert', async () => {
  const v = viewer(); await v.loadGLB(modelFile());
  const distance = v.camera.position.distanceTo(v.controls.target);
  assert.ok(distance > 20 && distance < 100, `building framing distance: ${distance}`);
  assert.ok(distance < v.controls.maxDistance && distance < v.camera.far);
  assert.ok(v.controls.target.y > 5 && v.controls.target.y < 10);
  assert.equal(v.flags.autoCamera, false);
  assert.equal(v.flags.autoRotate, false);
  assert.ok(v.glbGroup.getObjectByName('石核_层40').scale.x < 0.00001);
});

test('imported construction reaches the last frame and can scrub backward afterward', async () => {
  const v = viewer(); await v.loadGLB(modelFile());
  v.sampleGLB(20);
  assert.equal(v.glbGroup.getObjectByName('石核_层40').scale.x, 1);
  v.sampleGLB(10);
  assert.ok(Math.abs(v.glbGroup.getObjectByName('石核_层40').scale.x - 0.5) < 0.00001);
  v.sampleGLB(0);
  assert.ok(v.glbGroup.getObjectByName('石核_层40').scale.x < 0.00001);
});

test('replacing and removing imports disposes resources and restores the original camera', async () => {
  const v = viewer(); const originalPosition = v.camera.position.clone(); const originalTarget = v.controls.target.clone();
  await v.loadGLB(modelFile());
  const oldMixer = v.mixer; let geometryDisposals = 0; let materialDisposals = 0;
  const first = v.glbGroup.getObjectByName('石核_层40');
  first.geometry.addEventListener('dispose', () => geometryDisposals++);
  first.material.addEventListener('dispose', () => materialDisposals++);
  await v.loadGLB(modelFile({ named: false }));
  assert.equal(geometryDisposals, 1); assert.equal(materialDisposals, 1);
  assert.equal(oldMixer.stats.actions.inUse, 0);
  assert.ok(v.camera.position.distanceTo(v.controls.target) < v.controls.maxDistance);
  v.clearGLB();
  assert.deepEqual(v.camera.position, originalPosition); assert.deepEqual(v.controls.target, originalTarget);
  assert.equal(v.controls.maxDistance, 260); assert.equal(v.camera.far, 1300);
  assert.equal(v.glbGroup.children.length, 0); assert.equal(v.mixer, null);
  assert.equal(v.built.root.visible, true);
});
