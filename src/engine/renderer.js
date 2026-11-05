// Renderer, lighting and post-processing (bloom, vignette, optional pixelation) with quality tiers.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

export const QUALITY = {
  low: { maxPixelRatio: 1, scale: 0.8, shadows: 0, bloom: false, post: false, propShadows: false },
  medium: { maxPixelRatio: 1.5, scale: 1, shadows: 1024, bloom: true, post: true, propShadows: true },
  high: { maxPixelRatio: 2, scale: 1, shadows: 2048, bloom: true, post: true, propShadows: true },
};

const VignetteShader = {
  uniforms: { tDiffuse: { value: null }, strength: { value: 0.25 } },
  vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform float strength; varying vec2 vUv;
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      vec2 d = vUv - 0.5;
      float v = smoothstep(0.85, 0.2, length(d) * 1.25);
      c.rgb *= mix(1.0 - strength, 1.0, v);
      gl_FragColor = c;
    }`,
};

export class Renderer {
  constructor(canvas, settings) {
    this.canvas = canvas;
    this.settings = settings;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.info.autoReset = false; // count every pass of a frame, reset in render()

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(60, 1, 0.1, 900);

    this.hemi = new THREE.HemisphereLight('#BFD9FF', '#6B5A3E', 1.1);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight('#FFF1D6', 2.6);
    this.sun.castShadow = true;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.04;
    this.scene.add(this.sun, this.sun.target);
    this.sunDir = new THREE.Vector3(0.5, 0.8, 0.3).normalize();

    this.composer = new EffectComposer(this.renderer);
    this.renderPass = new RenderPass(this.scene, this.camera);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.55, 0.45, 1.0);
    this.vignette = new ShaderPass(VignetteShader);
    this.output = new OutputPass();
    this.composer.addPass(this.renderPass);
    this.composer.addPass(this.bloom);
    this.composer.addPass(this.vignette);
    this.composer.addPass(this.output);

    this.frameMs = 0;
    this.applySettings();
    this.resize();
  }

  /** Configure sun from map data and fit the shadow frustum to the map. */
  setSun({ azimuth = 215, elevation = 52, color = '#FFF1D6', intensity = 2.6 }, mapSize) {
    const az = (azimuth * Math.PI) / 180;
    const el = (elevation * Math.PI) / 180;
    this.sunDir.set(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)).normalize();
    this.sun.color.set(color);
    this.sun.intensity = intensity;
    const half = Math.max(mapSize.w, mapSize.d) * 0.62;
    const cam = this.sun.shadow.camera;
    cam.left = -half; cam.right = half; cam.top = half; cam.bottom = -half;
    cam.near = 1; cam.far = half * 4;
    cam.updateProjectionMatrix();
    this.sun.position.copy(this.sunDir).multiplyScalar(half * 2);
    this.sun.target.position.set(0, 0, 0);
  }

  applySettings() {
    const s = this.settings;
    const q = QUALITY[s.quality] || QUALITY.medium;
    this.q = q;
    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    const pix = Math.max(1, s.pixelation | 0);
    this.pixelRatio = (Math.min(dpr, q.maxPixelRatio) * q.scale) / pix;
    this.renderer.setPixelRatio(this.pixelRatio);
    this.canvas.style.imageRendering = pix > 1 ? 'pixelated' : 'auto';
    const shadowSize = q.shadows;
    this.renderer.shadowMap.enabled = shadowSize > 0;
    this.sun.castShadow = shadowSize > 0;
    if (shadowSize > 0 && this.sun.shadow.mapSize.x !== shadowSize) {
      this.sun.shadow.mapSize.set(shadowSize, shadowSize);
      if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; }
    }
    this.renderer.shadowMap.type = s.quality === 'high' ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
    this.bloom.enabled = q.bloom && s.bloom !== false;
    this.vignette.uniforms.strength.value = s.vignette === false ? 0 : 0.25;
    this.usePost = q.post;
    this.resize();
  }

  resize() {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    if (w === this._w && h === this._h && this.pixelRatio === this._pr) return;
    this._w = w; this._h = h; this._pr = this.pixelRatio;
    this.renderer.setSize(w, h, false);
    this.composer.setPixelRatio(this.pixelRatio);
    this.composer.setSize(w, h);
    this.bloom.resolution.set(Math.max(1, (w * this.pixelRatio) / 2), Math.max(1, (h * this.pixelRatio) / 2));
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  render() {
    this.resize();
    const t0 = performance.now();
    this.renderer.info.reset();
    if (this.usePost) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
    this.frameMs = performance.now() - t0;
  }

  info() {
    const i = this.renderer.info;
    return { calls: i.render.calls, triangles: i.render.triangles, geometries: i.memory.geometries, textures: i.memory.textures };
  }
}
