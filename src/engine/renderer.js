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
  ultra: { maxPixelRatio: 2.5, scale: 1, shadows: 4096, bloom: true, post: true, propShadows: true },
};

/** Neutral grade (no change); maps override it with data/themes.json grade. */
export const NEUTRAL_GRADE = { lift: [0, 0, 0], gamma: [1, 1, 1], gain: [1, 1, 1], saturation: 1, contrast: 1 };

// Vignette + colour grade (lift / gamma / gain, saturation, contrast) in one pass, after tone mapping.
const VignetteShader = {
  uniforms: {
    tDiffuse: { value: null }, strength: { value: 0.25 },
    lift: { value: new THREE.Vector3(0, 0, 0) }, gamma: { value: new THREE.Vector3(1, 1, 1) }, gain: { value: new THREE.Vector3(1, 1, 1) },
    saturation: { value: 1 }, contrast: { value: 1 }, flash: { value: new THREE.Vector4(0, 0, 0, 0) },
  },
  vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform float strength; varying vec2 vUv;
    uniform vec3 lift; uniform vec3 gamma; uniform vec3 gain; uniform float saturation; uniform float contrast; uniform vec4 flash;
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      vec3 g = clamp(c.rgb * gain + lift * (1.0 - c.rgb), 0.0, 1.0);
      g = pow(g, 1.0 / gamma);
      float l = dot(g, vec3(0.2126, 0.7152, 0.0722));
      g = mix(vec3(l), g, saturation);
      g = (g - 0.5) * contrast + 0.5;
      c.rgb = mix(clamp(g, 0.0, 1.0), flash.rgb, flash.a);
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
    // grade + vignette run after OutputPass (display-referred sRGB values)
    this.composer.addPass(this.renderPass);
    this.composer.addPass(this.bloom);
    this.composer.addPass(this.output);
    this.composer.addPass(this.vignette);
    this.grade = { ...NEUTRAL_GRADE };
    this.flashState = { r: 0, g: 0, b: 0, a: 0, life: 0, max: 1 };

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
    const res = Math.min(1, Math.max(0.5, Number(s.resolutionScale) || 1));
    this.pixelRatio = (Math.min(dpr, q.maxPixelRatio) * q.scale * res) / pix;
    this.renderer.setPixelRatio(this.pixelRatio);
    this.canvas.style.imageRendering = pix > 1 ? 'pixelated' : 'auto';
    const shadowSize = q.shadows;
    this.renderer.shadowMap.enabled = shadowSize > 0;
    this.sun.castShadow = shadowSize > 0;
    if (shadowSize > 0 && this.sun.shadow.mapSize.x !== shadowSize) {
      this.sun.shadow.mapSize.set(shadowSize, shadowSize);
      if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; }
    }
    this.renderer.shadowMap.type = s.quality === 'high' || s.quality === 'ultra' ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
    this.bloom.enabled = q.bloom && s.bloom !== false;
    this.vignette.uniforms.strength.value = s.vignette === false ? 0 : 0.25;
    this._applyGrade();
    this.usePost = q.post;
    this.resize();
  }

  /** Theme colour grade (data/themes.json); high contrast and the setting switch it off. */
  setGrade(grade) {
    this.grade = { ...NEUTRAL_GRADE, ...(grade || {}) };
    this._applyGrade();
  }

  _applyGrade() {
    const on = this.settings.colorGrade !== false && !this.settings.highContrast;
    const g = on ? this.grade : NEUTRAL_GRADE;
    const u = this.vignette.uniforms;
    u.lift.value.set(...g.lift); u.gamma.value.set(...g.gamma); u.gain.value.set(...g.gain);
    u.saturation.value = g.saturation; u.contrast.value = this.settings.highContrast ? 1.12 : g.contrast;
  }

  /** Brief full-screen tint (boss death, evolve); skipped in reduced motion. */
  flash(color, alpha = 0.3, life = 0.3) {
    if (this.settings.reducedMotion || !this.usePost) return;
    const c = new THREE.Color(color);
    Object.assign(this.flashState, { r: c.r, g: c.g, b: c.b, a: alpha, life, max: life });
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
    const f = this.flashState;
    if (f.life > 0) { f.life = Math.max(0, f.life - (this._lastDt || 0.016)); this.vignette.uniforms.flash.value.set(f.r, f.g, f.b, f.a * (f.life / f.max)); } else this.vignette.uniforms.flash.value.w = 0;
    if (this.usePost) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
    this.frameMs = performance.now() - t0;
  }

  info() {
    const i = this.renderer.info;
    return { calls: i.render.calls, triangles: i.render.triangles, geometries: i.memory.geometries, textures: i.memory.textures };
  }
}
