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
 *
 * Este es solo el reparto POR DEFECTO. Cada personaje puede traer el suyo en
 * data/sprites/<id>.json (su "rig"), que es donde se edita ahora — el pliego
 * de Gabo no tiene las mismas poses que el de Giuli.
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

/** El rig por defecto, equivalente a lo que hacía el motor antes de que los
 *  personajes pudieran traer el suyo. */
export const DEFAULT_RIG = {
  walk: { fps: WALK_FPS, rows: ROW_BY_FACING },
  actions: { fps: POSE_FPS, poses: POSES },
  idle: null,
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
  constructor(sheet, { height = 1.5, y = 0, rig = null } = {}) {
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

    this.setRig(rig);

    this.facing = "south";
    this.frame = 0;
    this._timer = 0;
    this._moving = false;

    // Animación de espera, al estilo del Sonic al que dejas de pulsarle: si
    // lleva un rato quieta y nadie le ha pedido otra pose, saca el móvil o se
    // encoge de hombros. Sale del rig (data/sprites/<id>.json -> idle); sin
    // ese bloque, el personaje simplemente se queda quieto como antes.
    this._stillFor = 0;
    this._idlePose = null;
    this._idleLeft = 0;

    // Pose de accion en curso (cafe, peli, dormir...). Mientras haya una, el
    // sprite deja de mirar la hoja de caminar y anima esa pose en bucle.
    this._poseSheet = null; // textura de la hoja *-acciones
    this._pose = null; // indice 0..7 en POSES
    this._poseFrame = 0;
    this._poseTimer = 0;

    this._applyFrame();
  }

  /**
   * El mapa de la rejilla de ESTE personaje: filas de caminata, poses de
   * acción y animación de espera. Ver data/sprites/<id>.json.
   */
  setRig(rig) {
    this.rig = {
      walk: { ...DEFAULT_RIG.walk, ...(rig?.walk ?? {}) },
      actions: { ...DEFAULT_RIG.actions, ...(rig?.actions ?? {}) },
      idle: rig?.idle ?? null,
    };
    this._stillFor = 0;
    this._idlePose = null;
    this._idleLeft = 0;
  }

  /**
   * Cambiar de personaje sin recrear el sprite (la selección de personaje
   * ocurre con el juego ya montado, no al arrancar).
   */
  setSheet(sheet) {
    if (!sheet) return;
    // Cada setSheet()/setActionSheet() clona la textura (necesita su propio
    // offset/repeat por instancia) — sin disponer el clon anterior, elegir
    // personaje varias veces en una partida (menú de pausa, easter eggs) iba
    // dejando texturas huérfanas en la GPU.
    this.texture?.dispose();
    this._poseSheet?.dispose();
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
    this._poseSheet?.dispose();
    this._poseSheet = sheet.clone();
    this._poseSheet.needsUpdate = true;
    this._poseSheet.repeat.set(1 / FRAME_COLS, 1 / FRAME_ROWS);
  }

  get hasPoses() {
    return !!this._poseSheet;
  }

  /** `name` es una pose del rig, o null para volver a la hoja de caminar. */
  setPose(name) {
    // Mientras corre la animación de espera, un "sin pose" no la tumba: quien
    // la pide es el bucle del jugador, que manda `null` en cada frame en que
    // no estás haciendo nada. La corta _updateIdle cuando toca.
    if (name == null && this._idlePose) return;
    const pose = name == null ? null : this.rig.actions.poses[name];
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
    this._updateIdle(dt);

    if (this._pose != null && this._poseSheet) {
      this._poseTimer += dt;
      const step = 1 / (this.rig.actions.fps || POSE_FPS);
      while (this._poseTimer >= step) {
        this._poseTimer -= step;
        this._poseFrame = 1 - this._poseFrame;
        this._applyFrame();
      }
      return;
    }
    if (!this._moving) return;
    this._timer += dt;
    const step = 1 / (this.rig.walk.fps || WALK_FPS);
    while (this._timer >= step) {
      this._timer -= step;
      this.frame = (this.frame + 1) % FRAME_COLS;
      this._applyFrame();
    }
  }

  /**
   * Cuenta cuánto lleva quieta y, pasado el umbral, le pone una pose de
   * espera un par de segundos. Se corta en cuanto se mueve o alguien pide una
   * pose de verdad (tomar café), que siempre manda sobre esto.
   */
  _updateIdle(dt) {
    const idle = this.rig.idle;
    if (!idle || !this._poseSheet || this._moving) {
      if (this._idlePose) {
        this._idlePose = null;
        this.setPose(null);
      }
      this._stillFor = 0;
      this._idleLeft = 0;
      return;
    }
    // Alguien pidió una pose que no es la de espera: manda ella.
    if (this._pose != null && !this._idlePose) {
      this._stillFor = 0;
      return;
    }

    if (this._idlePose) {
      this._idleLeft -= dt;
      if (this._idleLeft <= 0) {
        this._idlePose = null;
        this.setPose(null);
        this._stillFor = -(idle.every ?? 9) + (idle.after ?? 4.5);
      }
      return;
    }

    this._stillFor += dt;
    if (this._stillFor < (idle.after ?? 4.5)) return;
    const options = (idle.poses ?? []).filter((p) => this.rig.actions.poses[p] != null);
    if (!options.length) return;
    this._idlePose = options[Math.floor(Math.random() * options.length)];
    this._idleLeft = idle.hold ?? 2.2;
    this._stillFor = 0;
    this.setPose(this._idlePose);
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
