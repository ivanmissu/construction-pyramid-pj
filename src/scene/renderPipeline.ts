import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

export type RenderQuality = 'performance' | 'balanced' | 'quality';

const PROFILES = {
  performance: { dpr: 1.25, pixels: 2_000_000, aoScale: 0.5, aoSamples: 6, denoiseSamples: 8, msaa: 0 },
  balanced: { dpr: 1.5, pixels: 2_600_000, aoScale: 0.65, aoSamples: 8, denoiseSamples: 12, msaa: 0 },
  quality: { dpr: 2, pixels: 4_000_000, aoScale: 1, aoSamples: 16, denoiseSamples: 16, msaa: 2 },
} as const;

/** GTAO's normal override treats translucent meshes as opaque unless explicitly excluded. */
export class OpaqueGTAOPass extends GTAOPass {
  resolutionScale = 1;
  private hidden: THREE.Object3D[] = [];

  private hideTranslucent = (object: THREE.Object3D) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    if (materials.some((material) => !material.depthWrite || !material.visible || (material.transparent && material.opacity < 0.99))) {
      this.hidden.push(mesh);
      mesh.visible = false;
    }
  };

  override setSize(width: number, height: number) {
    super.setSize(Math.max(1, Math.round(width * this.resolutionScale)), Math.max(1, Math.round(height * this.resolutionScale)));
  }

  override render(
    renderer: THREE.WebGLRenderer,
    writeBuffer: THREE.WebGLRenderTarget,
    readBuffer: THREE.WebGLRenderTarget,
    deltaTime: number,
    maskActive: boolean,
  ) {
    this.scene.traverseVisible(this.hideTranslucent);
    try {
      super.render(renderer, writeBuffer, readBuffer, deltaTime, maskActive);
    } finally {
      for (const object of this.hidden) object.visible = true;
      this.hidden.length = 0;
    }
  }

  override dispose() {
    super.dispose();
    // Three r186's GTAOPass.dispose omits these two shader materials.
    this.gtaoMaterial.dispose();
    this.blendMaterial.dispose();
  }
}

export type RenderContext = {
  enhanced: boolean;
  /** Set to zero in cutaway/first-person views; translucent shells are filtered separately. */
  ambientOcclusion?: number;
  deltaTime?: number;
};

/** Real-time raster lighting: contact shading, HDR highlights, and antialiasing. */
export class KhufuRenderPipeline {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.Camera;
  private composer: EffectComposer;
  private ao: OpaqueGTAOPass;
  private bloom: UnrealBloomPass;
  private quality: RenderQuality;
  private width = 1;
  private height = 1;
  private deviceRatio = 1;

  constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, quality: RenderQuality = 'balanced') {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.quality = quality;
    const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType });
    this.composer = new EffectComposer(renderer, target);
    this.composer.addPass(new RenderPass(scene, camera));

    this.ao = new OpaqueGTAOPass(scene, camera, 1, 1);
    this.ao.blendIntensity = 0.46;
    this.ao.updateGtaoMaterial({ radius: 0.55, distanceExponent: 1.5, thickness: 0.3, scale: 1, distanceFallOff: 1, screenSpaceRadius: false });
    this.ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 4, radius: 3, radiusExponent: 1, rings: 2 });
    this.composer.addPass(this.ao);

    // Keep bloom above ordinary stone luminance so daylight retains its surface detail.
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.1, 0.3, 1.15);
    this.composer.addPass(this.bloom);
    // r186 SMAAPass operates in linear-sRGB and must precede OutputPass.
    this.composer.addPass(new SMAAPass());
    this.composer.addPass(new OutputPass());
    this.setQuality(quality);
  }

  setQuality(quality: RenderQuality) {
    this.quality = quality;
    const profile = PROFILES[quality];
    this.ao.resolutionScale = profile.aoScale;
    this.ao.updateGtaoMaterial({ samples: profile.aoSamples });
    this.ao.updatePdMaterial({ samples: profile.denoiseSamples });
    const samples = Math.min(profile.msaa, this.renderer.capabilities.maxSamples);
    for (const target of [this.composer.renderTarget1, this.composer.renderTarget2]) {
      if (target.samples !== samples) {
        target.samples = samples;
        target.dispose();
      }
    }
    this.resize(this.width, this.height, this.deviceRatio);
  }

  resize(width: number, height: number, devicePixelRatio = window.devicePixelRatio || 1) {
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    this.deviceRatio = devicePixelRatio;
    const profile = PROFILES[this.quality];
    const ratio = Math.min(Math.max(0.5, devicePixelRatio), profile.dpr, Math.sqrt(profile.pixels / (this.width * this.height)));
    this.renderer.setPixelRatio(ratio);
    this.renderer.setSize(this.width, this.height, false);
    this.composer.setPixelRatio(ratio);
    this.composer.setSize(this.width, this.height);
  }

  render({ enhanced, ambientOcclusion = 1, deltaTime }: RenderContext) {
    if (!enhanced || this.quality === 'performance') {
      this.renderer.render(this.scene, this.camera);
      return;
    }
    const amount = THREE.MathUtils.clamp(ambientOcclusion, 0, 1);
    this.ao.enabled = amount > 0.01;
    this.ao.blendIntensity = amount * 0.46;
    this.composer.render(deltaTime);
  }

  dispose() {
    for (const pass of this.composer.passes) pass.dispose();
    this.composer.dispose();
  }
}

/** A small linear HDR sky/ground map, prefiltered once for stone and metal reflections. */
export function createDesertEnvironment(renderer: THREE.WebGLRenderer): { texture: THREE.Texture; dispose: () => void } {
  const width = 128;
  const height = 64;
  const data = new Float32Array(width * height * 4);
  const sky = new THREE.Color(0x88b7de);
  const horizon = new THREE.Color(0xe6dcc3);
  const ground = new THREE.Color(0xa88957);
  const color = new THREE.Color();
  for (let y = 0; y < height; y++) {
    const elevation = Math.sin(((y + 0.5) / height - 0.5) * Math.PI);
    if (elevation >= 0) {
      color.copy(horizon).lerp(sky, Math.pow(elevation, 0.55)).multiplyScalar(1.2);
    } else {
      color.copy(horizon).lerp(ground, Math.pow(-elevation, 0.35)).multiplyScalar(0.65);
    }
    for (let x = 0; x < width; x++) {
      const offset = (y * width + x) * 4;
      data[offset] = color.r;
      data[offset + 1] = color.g;
      data[offset + 2] = color.b;
      data[offset + 3] = 1;
    }
  }
  const source = new THREE.DataTexture(data, width, height, THREE.RGBAFormat, THREE.FloatType);
  source.mapping = THREE.EquirectangularReflectionMapping;
  source.colorSpace = THREE.LinearSRGBColorSpace;
  source.needsUpdate = true;
  const generator = new THREE.PMREMGenerator(renderer);
  const environment = generator.fromEquirectangular(source);
  source.dispose();
  generator.dispose();
  return { texture: environment.texture, dispose: () => environment.dispose() };
}
