import * as THREE from "three";

// 2D character sprites. Each character is a single PNG sheet laid out as
// 4 columns (walk cycle) x 4 rows (facing), always billboarded toward the
// fixed isometric camera — the characters are flat art in a 3D set, exactly
// like the reference image.

export const FRAME_COLS = 4;
export const FRAME_ROWS = 4;
export const ROW_BY_FACING = { south: 0, west: 1, east: 2, north: 3 };

const FRAME_ASPECT = 32 / 44; // matches tools/gen_sprites.py
const WALK_FPS = 8;

const loader = new THREE.TextureLoader();
const sheetCache = new Map();

export function loadSheet(url) {
  if (!sheetCache.has(url)) {
    sheetCache.set(
      url,
      new Promise((resolve, reject) => {
        loader.load(
          url,
          (texture) => {
            texture.colorSpace = THREE.SRGBColorSpace;
            texture.magFilter = THREE.NearestFilter;
            texture.minFilter = THREE.NearestFilter;
            texture.generateMipmaps = false;
            resolve(texture);
          },
          undefined,
          reject
        );
      })
    );
  }
  return sheetCache.get(url);
}

export function loadSheets(urls) {
  return Promise.all(urls.map(loadSheet));
}

export class CharacterSprite {
  constructor(sheet, { height = 1.5, y = 0 } = {}) {
    // Clone so every character owns its own UV offset; the underlying image
    // data is still shared.
    this.texture = sheet.clone();
    this.texture.needsUpdate = true;
    this.texture.repeat.set(1 / FRAME_COLS, 1 / FRAME_ROWS);

    this.material = new THREE.SpriteMaterial({
      map: this.texture,
      transparent: true,
      alphaTest: 0.4,
      depthWrite: true,
      toneMapped: false,
    });

    this.object = new THREE.Sprite(this.material);
    this.height = height;
    this.object.scale.set(height * FRAME_ASPECT, height, 1);
    this.baseY = y + height / 2;
    this.object.position.y = this.baseY;

    this.facing = "south";
    this.frame = 0;
    this._timer = 0;
    this._moving = false;
    this._applyFrame();
  }

  setFacing(facing) {
    if (facing && facing !== this.facing && ROW_BY_FACING[facing] !== undefined) {
      this.facing = facing;
      this._applyFrame();
    }
  }

  setMoving(moving) {
    if (moving === this._moving) return;
    this._moving = moving;
    if (!moving) {
      // Column 0 doubles as each direction's idle pose.
      this.frame = 0;
      this._timer = 0;
      this._applyFrame();
    }
  }

  setPosition(x, z) {
    this.object.position.x = x;
    this.object.position.z = z;
  }

  /** Dim the sprite while hidden, so cover reads at a glance. */
  setTint(scalar) {
    this.material.color.setScalar(scalar);
  }

  update(dt) {
    if (!this._moving) return;
    this._timer += dt;
    const step = 1 / WALK_FPS;
    while (this._timer >= step) {
      this._timer -= step;
      this.frame = (this.frame + 1) % FRAME_COLS;
      this._applyFrame();
    }
  }

  _applyFrame() {
    const row = ROW_BY_FACING[this.facing] ?? 0;
    this.texture.offset.set(this.frame / FRAME_COLS, 1 - (row + 1) / FRAME_ROWS);
  }
}
