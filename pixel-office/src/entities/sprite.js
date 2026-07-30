import * as THREE from "three";

// 2D character sprites. Each character is a single PNG sheet laid out as
// 4 columns (walk cycle) x 4 rows (facing), always billboarded toward the
// fixed isometric camera — the characters are flat art in a 3D set, exactly
// like the reference image.

export const FRAME_COLS = 4;
export const FRAME_ROWS = 4;
export const ROW_BY_FACING = { south: 0, west: 1, east: 2, north: 3 };

const FRAME_ASPECT = 32 / 44; // matches tools/gen_sprites.py y tools/pack-sprites.py
const WALK_FPS = 8;
const POSE_FPS = 3; // las poses de "acciones" son de dos fotogramas, sin prisa

/**
 * Las hojas de ACCIONES (`*-acciones.png`) usan la misma rejilla 4x4, pero
 * leida distinto: son 8 poses de 2 fotogramas cada una, en lectura normal.
 * La pose `p` ocupa la fila `p>>1` y las columnas `(p%2)*2` y `+1`.
 * Los nombres de abajo son el contrato entre el JSON y el arte — si dibujas
 * un pliego nuevo, respeta este orden y no hay que tocar codigo.
 */
export const POSES = {
  work: 0,
  sleep: 1,
  coffee: 2,
  eat: 3,
  movie: 4,
  phone: 5,
  scared: 6,
  shrug: 7,
};

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

    // Pose de accion en curso (cafe, peli, dormir...). Mientras haya una, el
    // sprite deja de mirar la hoja de caminar y anima esa pose en bucle.
    this._poseSheet = null; // textura de la hoja *-acciones
    this._pose = null; // indice 0..7 en POSES
    this._poseFrame = 0;
    this._poseTimer = 0;

    this._applyFrame();
  }

  /**
   * Cambiar de personaje sin recrear el sprite (la selección de personaje
   * ocurre con el juego ya montado, no al arrancar).
   */
  setSheet(sheet) {
    if (!sheet) return;
    this.texture = sheet.clone();
    this.texture.needsUpdate = true;
    this.texture.repeat.set(1 / FRAME_COLS, 1 / FRAME_ROWS);
    this._poseSheet = null;
    this.setPose(null);
    this.material.map = this.texture;
    this.material.needsUpdate = true;
    this._applyFrame();
  }

  /**
   * La hoja de acciones de este personaje, si la tiene. Sin ella `setPose()`
   * no hace nada y el personaje se queda con su pose de caminar de siempre —
   * asi los sprites viejos (employee, npc1..4) siguen funcionando igual.
   */
  setActionSheet(sheet) {
    if (!sheet) return;
    this._poseSheet = sheet.clone();
    this._poseSheet.needsUpdate = true;
    this._poseSheet.repeat.set(1 / FRAME_COLS, 1 / FRAME_ROWS);
  }

  get hasPoses() {
    return !!this._poseSheet;
  }

  /** `name` es una clave de POSES, o null para volver a la hoja de caminar. */
  setPose(name) {
    const pose = name == null ? null : POSES[name];
    if (pose === this._pose) return;
    this._pose = pose ?? null;
    this._poseFrame = 0;
    this._poseTimer = 0;
    const wanted = this._pose != null && this._poseSheet ? this._poseSheet : this.texture;
    if (this.material.map !== wanted) {
      this.material.map = wanted;
      this.material.needsUpdate = true;
    }
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
    if (this._pose != null && this._poseSheet) {
      this._poseTimer += dt;
      const step = 1 / POSE_FPS;
      while (this._poseTimer >= step) {
        this._poseTimer -= step;
        this._poseFrame = 1 - this._poseFrame;
        this._applyFrame();
      }
      return;
    }
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
    if (this._pose != null && this._poseSheet) {
      const row = this._pose >> 1;
      const col = (this._pose % 2) * 2 + this._poseFrame;
      this._poseSheet.offset.set(col / FRAME_COLS, 1 - (row + 1) / FRAME_ROWS);
      return;
    }
    const row = ROW_BY_FACING[this.facing] ?? 0;
    this.texture.offset.set(this.frame / FRAME_COLS, 1 - (row + 1) / FRAME_ROWS);
  }
}
