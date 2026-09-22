import * as THREE from 'three';

/** Small, deterministic mineral grain; shared by the stone surfaces, with no downloads. */
export function createStoneTexture() {
  const size = 128;
  const pixels = new Uint8Array(size * size * 4);
  let seed = 7143;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      const grain = (seed / 4294967296 - 0.5) * 34;
      const mineral = Math.sin(x * Math.PI / 16) * Math.sin(y * Math.PI / 32) * 8;
      const value = Math.round(218 + grain + mineral);
      const offset = (y * size + x) * 4;
      pixels[offset] = pixels[offset + 1] = pixels[offset + 2] = value;
      pixels[offset + 3] = 255;
    }
  }
  const texture = new THREE.DataTexture(pixels, size, size, THREE.RGBAFormat);
  texture.name = 'Limestone mineral grain';
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.repeat.set(3, 3);
  texture.needsUpdate = true;
  return texture;
}
