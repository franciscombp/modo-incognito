import * as THREE from "three";

// Pixel-art presentation pass.
//
// The 3D scene exists so collisions, occlusion and the floor layout are easy
// to reason about — but the game should *look* like 2D pixel art seen at an
// angle. So we render the whole scene into a small offscreen target and blit
// it back up with nearest-neighbour sampling: every edge lands on a chunky
// pixel grid, exactly like a sprite-based game.
//
// The shader also snaps colours to a fixed number of levels, which is what
// stops the smooth 3D gradients from giving the trick away.

const VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const FRAG = /* glsl */ `
  precision mediump float;
  uniform sampler2D tDiffuse;
  uniform vec2 uResolution;
  uniform float uLevels;
  uniform float uSaturation;
  varying vec2 vUv;

  // The offscreen target stores sRGB, so the hardware hands us linear values
  // on sample. Everything below (quantising, saturation) wants to happen in
  // display space, and the default framebuffer expects sRGB, so convert back
  // first instead of letting the frame come out several stops too dark.
  vec3 toSRGB(vec3 c) {
    c = max(c, vec3(0.0));
    return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c));
  }

  void main() {
    // Sample at the centre of the low-res texel so the upscale stays crisp
    // even when the canvas size is not an exact multiple of the pixel size.
    vec2 texel = 1.0 / uResolution;
    vec2 uv = (floor(vUv * uResolution) + 0.5) * texel;
    vec3 c = toSRGB(texture2D(tDiffuse, uv).rgb);

    // La cuantización de color sigue disponible (es un ajuste del menú), pero
    // por defecto está fuera: escalonar los degradados era lo que vendía el
    // pixel art, y ahora lo que hace es cortar en bandas las superficies
    // planas y las caras de los personajes.
    if (uLevels > 1.5 && uLevels < 63.0) {
      c = floor(c * uLevels + 0.5) / uLevels;
    }

    float grey = dot(c, vec3(0.299, 0.587, 0.114));
    c = mix(vec3(grey), c, uSaturation);

    // Grado cozy: una viñeta muy suave y un punto de calidez hacia los bordes.
    // Es lo que hace que la escena parezca un diorama iluminado y no una
    // captura plana de un visor 3D.
    float d = distance(vUv, vec2(0.5));
    float vignette = 1.0 - smoothstep(0.42, 0.95, d) * 0.22;
    c *= vignette;
    c = mix(c, c * vec3(1.03, 0.995, 0.965), smoothstep(0.2, 0.9, d));

    gl_FragColor = vec4(c, 1.0);
  }
`;

export class PixelPipeline {
  constructor(renderer, { pixelSize = 1, levels = 64, saturation = 1.06 } = {}) {
    this.renderer = renderer;
    this.pixelSize = pixelSize;
    // La pasada corre SIEMPRE, también con pixelSize 1. Antes se saltaba
    // entera cuando no había que pixelar, pero ahora es también quien pone la
    // viñeta y la calidez de los bordes — sin ella el diorama se ve plano.
    this.enabled = true;

    this.target = new THREE.WebGLRenderTarget(1, 1, {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      depthBuffer: true,
      stencilBuffer: false,
      colorSpace: THREE.SRGBColorSpace,
    });

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: this.target.texture },
        uResolution: { value: new THREE.Vector2(1, 1) },
        uLevels: { value: levels },
        uSaturation: { value: saturation },
      },
      vertexShader: VERT,
      fragmentShader: FRAG,
      depthTest: false,
      depthWrite: false,
    });

    this.quadScene = new THREE.Scene();
    this.quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.quadScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material));

    this.size = new THREE.Vector2(1, 1);
  }

  setSize(width, height) {
    this.size.set(width, height);
    this._resizeTarget();
  }

  setPixelSize(pixelSize) {
    this.pixelSize = Math.max(1, Math.round(pixelSize));
    this._resizeTarget();
  }

  setLevels(levels) {
    this.material.uniforms.uLevels.value = levels;
  }

  _resizeTarget() {
    const w = Math.max(1, Math.floor(this.size.x / this.pixelSize));
    const h = Math.max(1, Math.floor(this.size.y / this.pixelSize));
    this.target.setSize(w, h);
    this.material.uniforms.uResolution.value.set(w, h);
  }

  render(scene, camera) {
    if (!this.enabled) {
      this.renderer.setRenderTarget(null);
      this.renderer.render(scene, camera);
      return;
    }
    this.renderer.setRenderTarget(this.target);
    this.renderer.clear();
    this.renderer.render(scene, camera);
    this.renderer.setRenderTarget(null);
    this.renderer.render(this.quadScene, this.quadCamera);
  }

  dispose() {
    this.target.dispose();
    this.material.dispose();
  }
}
