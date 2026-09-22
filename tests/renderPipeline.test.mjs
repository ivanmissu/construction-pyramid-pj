import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { register } from 'node:module';
register('./typescript-loader.mjs', import.meta.url);
const { OpaqueGTAOPass } = await import('../src/scene/renderPipeline.ts');

test('transparent construction shells do not occlude the visible interior in GTAO', () => {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera();
  const shell = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial({ transparent: true, opacity: 0.1 }));
  const interior = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
  const sky = new THREE.Mesh(new THREE.SphereGeometry(), new THREE.MeshBasicMaterial({ depthWrite: false }));
  const hidden = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
  hidden.visible = false;
  scene.add(shell, interior, sky, hidden);
  const pass = new OpaqueGTAOPass(scene, camera, 16, 16);
  const originalRender = GTAOPass.prototype.render;
  GTAOPass.prototype.render = () => {
    assert.equal(shell.visible, false, 'translucent shell must not write a solid AO silhouette');
    assert.equal(sky.visible, false, 'non-depth-writing sky must not write to AO depth');
    assert.equal(interior.visible, true, 'opaque interior still contributes contact shading');
    assert.equal(hidden.visible, false);
  };
  try {
    pass.render({}, {}, {}, 0, false);
    assert.equal(shell.visible, true);
    assert.equal(sky.visible, true);
    assert.equal(hidden.visible, false);
  } finally {
    GTAOPass.prototype.render = originalRender;
    pass.dispose();
  }
});

test('a failed AO render cannot leave the main scene invisible', () => {
  const scene = new THREE.Scene();
  const shell = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial({ transparent: true, opacity: 0.1 }));
  scene.add(shell);
  const pass = new OpaqueGTAOPass(scene, new THREE.PerspectiveCamera(), 16, 16);
  const originalRender = GTAOPass.prototype.render;
  GTAOPass.prototype.render = () => { throw new Error('render interrupted'); };
  try {
    assert.throws(() => pass.render({}, {}, {}, 0, false), /render interrupted/);
    assert.equal(shell.visible, true);
  } finally {
    GTAOPass.prototype.render = originalRender;
    pass.dispose();
  }
});
