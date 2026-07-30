#!/usr/bin/env python3
"""Normaliza los pliegos de sprites dibujados a mano a la rejilla del motor.

El arte que llega de Aseprite/Photoshop viene en lienzos grandes y cuadrados
(1254x1254 en el caso de Gabo, Giuli y Crispo), con el personaje flotando en
medio de mucho transparente. El motor, en cambio, espera SIEMPRE lo mismo:

    una rejilla de 4 columnas x 4 filas, con celdas de 128x176 px
    (la misma proporcion 32:44 de los pliegos originales, x4)

Y ojo, porque el detalle importante es este: **los pliegos dibujados a mano no
estan en una rejilla regular**. En guili-camina, por ejemplo, las cuatro filas
miden 274, 257, 255 y 275 px — cortar por 1254/4 mete la cabeza de una fila en
el pie de la anterior. Asi que aqui no se corta a ciegas: se buscan las
franjas completamente transparentes y se usan ESAS como separadores.

Para cada pliego:

  1. detecta las 4 filas por las bandas horizontales vacias, y dentro de cada
     fila las 4 columnas por las bandas verticales vacias,
  2. recorta cada celda a su propio contenido,
  3. reescala las 16 con UNA sola escala (la que hace que la celda mas grande
     quepa en 128x176), asi el personaje no cambia de tamano entre fotogramas,
  4. las pega abajo y al centro — pies apoyados siempre en el mismo sitio,
  5. escribe el pliego resultante de 512x704.

Es idempotente: pasarlo dos veces no degrada mas alla del primer reescalado.

    python3 tools/pack-sprites.py                # todos los pliegos nuevos
    python3 tools/pack-sprites.py guili-camina   # solo uno
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image

SPRITES = Path(__file__).resolve().parent.parent / "public" / "sprites"
COLS, ROWS = 4, 4
FRAME_W, FRAME_H = 128, 176
# Aire por abajo, para que los pies no queden pegados al borde del fotograma.
FOOT_MARGIN = 4
ALPHA_MIN = 8  # por debajo de esto se considera transparente (bordes suaves)

# Los pliegos que dibuja el equipo. Los originales generados por
# tools/gen_sprites.py (employee, boss, npc1..4) ya estan en la rejilla buena
# y no se tocan.
DEFAULT = [
    "gabo-camina",
    "gabo-acciones",
    "guili-camina",
    "guili-acciones",
    "crispo-camina",
    "crispo-acciones",
]


def empty_bands(occupied):
    """Tramos contiguos sin contenido en un perfil booleano."""
    bands = []
    start = None
    for i, on in enumerate(occupied):
        if not on:
            if start is None:
                start = i
        elif start is not None:
            bands.append((start, i))
            start = None
    if start is not None:
        bands.append((start, len(occupied)))
    return bands


def split(occupied, parts):
    """Devuelve `parts` rangos [(ini,fin)] separados por los huecos mas anchos.

    Los huecos del principio y del final son margen, no separadores: solo
    cuentan los que tienen contenido a ambos lados.
    """
    idx = np.flatnonzero(occupied)
    if idx.size == 0:
        return None
    lo, hi = int(idx[0]), int(idx[-1]) + 1
    inner = [b for b in empty_bands(occupied) if b[0] > lo and b[1] < hi]
    if len(inner) < parts - 1:
        return None
    inner.sort(key=lambda b: b[1] - b[0], reverse=True)
    cuts = sorted((b[0] + b[1]) // 2 for b in inner[: parts - 1])
    edges = [lo, *cuts, hi]
    return [(edges[i], edges[i + 1]) for i in range(parts)]


def cells_of(sheet):
    """Las 16 celdas del pliego, en orden fila-mayor, recortadas a contenido."""
    alpha = np.array(sheet)[:, :, 3] > ALPHA_MIN
    row_ranges = split(alpha.any(axis=1), ROWS)
    if row_ranges is None:
        return None

    cells = []
    for top, bottom in row_ranges:
        strip = alpha[top:bottom]
        col_ranges = split(strip.any(axis=0), COLS)
        if col_ranges is None:
            return None
        for left, right in col_ranges:
            cell = sheet.crop((left, top, right, bottom))
            box = cell.getbbox()
            cells.append(cell.crop(box) if box else cell)
    return cells


def pack(name):
    path = SPRITES / f"{name}.png"
    if not path.exists():
        print(f"  (falta {path.name}, se salta)")
        return
    sheet = Image.open(path).convert("RGBA")
    cells = cells_of(sheet)
    if cells is None:
        print(f"  {path.name}: no se distinguen 4x4 celdas por transparencia, se salta")
        return

    # Una escala unica para las 16: la mas restrictiva de todas.
    scale = min(
        min(FRAME_W / c.width, (FRAME_H - FOOT_MARGIN) / c.height) for c in cells
    )

    out = Image.new("RGBA", (FRAME_W * COLS, FRAME_H * ROWS), (0, 0, 0, 0))
    for i, cell in enumerate(cells):
        tw = max(1, round(cell.width * scale))
        th = max(1, round(cell.height * scale))
        art = cell.resize((tw, th), Image.LANCZOS)
        x = (i % COLS) * FRAME_W + (FRAME_W - tw) // 2
        y = (i // COLS) * FRAME_H + (FRAME_H - FOOT_MARGIN - th)
        out.paste(art, (x, y), art)

    out.save(path)
    print(f"  {path.name}: {sheet.width}x{sheet.height} -> {out.width}x{out.height}")


if __name__ == "__main__":
    names = sys.argv[1:] or DEFAULT
    print(f"Empaquetando {len(names)} pliegos en celdas de {FRAME_W}x{FRAME_H}:")
    for n in names:
        pack(n)
