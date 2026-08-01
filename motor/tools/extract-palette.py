#!/usr/bin/env python3
"""Saca la paleta de un pliego de sprites para sembrar su receta 3D.

Los personajes 3D (`public/data/characters3d.json`) se pintan con colores
planos, y esos colores tienen que ser LOS DEL ARTE que dibujó el equipo — si
los invento a ojo, el Fran de 3D no es el Fran del pliego.

Lee la celda (fila 0 = mirando al frente, columna 0 = quieta) de cada
`*-camina.png` y saca el color dominante de cada franja horizontal: pelo,
piel, prenda de arriba, pantalón y zapatos. Es una aproximación con la que
empezar, no un dogma: el builder (`builder/personajes.html`) está para
retocar a mano lo que salga torcido.

Uso:
    python3 tools/extract-palette.py                # todos los pliegos
    python3 tools/extract-palette.py guili fran     # solo esos
"""

import glob
import json
import os
import sys
from collections import Counter

from PIL import Image

SPRITES = os.path.join(os.path.dirname(__file__), "..", "public", "sprites")

COLS = 4
ROWS = 4

# Franjas del CUERPO (no de la celda), en fracción de su alto, y qué anchura
# central mirar en cada una. La cabeza ocupa mucho en estos pliegos (son
# cabezones a propósito). El ancho importa: en la franja del torso, mirar de
# lado a lado cuenta los brazos y el fondo, y en la del pelo cuenta las orejas.
BANDS = {
    "hair": (0.00, 0.10, 0.60),
    "skin": (0.16, 0.26, 0.30),
    "top": (0.40, 0.55, 0.34),
    "bottom": (0.68, 0.82, 0.40),
    "shoes": (0.94, 1.00, 0.80),
}


def cell(image):
    """La celda de mirar al frente y quieta, recortada al cuerpo.

    Los pliegos no están todos empaquetados igual (los dibujados a mano llegan
    con más aire arriba que los generados), así que medir franjas desde el
    borde de la celda pone la "cara" de uno a la altura del pecho de otro. Se
    recorta primero a lo que de verdad es opaco y todo lo demás se mide sobre
    esa caja.
    """
    w = image.width // COLS
    h = image.height // ROWS
    front = image.crop((0, 0, w, h))
    box = front.getchannel("A").point(lambda a: 255 if a > 200 else 0).getbbox()
    return front.crop(box) if box else front


def dominant(pixels):
    """Color más repetido, ignorando transparencia y línea de contorno.

    El contorno es casi negro y recorre toda la figura, así que sin filtrarlo
    gana él en cualquier franja y todos los personajes salen vestidos de negro.
    """
    counts = Counter()
    for r, g, b, a in pixels:
        if a < 200:
            continue
        luma = 0.299 * r + 0.587 * g + 0.114 * b
        if luma < 42:  # contorno
            continue
        # Se agrupa de 8 en 8 para que el sombreado no parta el voto en 30
        # tonos casi iguales del mismo color.
        counts[(r // 8 * 8, g // 8 * 8, b // 8 * 8)] += 1
    if not counts:
        return None
    r, g, b = counts.most_common(1)[0][0]
    return f"#{r:02x}{g:02x}{b:02x}"


def palette_of(path):
    image = Image.open(path).convert("RGBA")
    front = cell(image)
    w, h = front.size

    out = {}
    for name, (a, b, width) in BANDS.items():
        margin = int(w * (1 - width) / 2)
        band = front.crop((margin, int(h * a), w - margin, max(1, int(h * b))))
        color = dominant(list(band.getdata()))
        if color:
            out[name] = color
    return out


def main():
    wanted = [a.lower() for a in sys.argv[1:]]
    result = {}
    for path in sorted(glob.glob(os.path.join(SPRITES, "*-camina.png"))):
        name = os.path.basename(path).replace("-camina.png", "")
        if wanted and name.lower() not in wanted:
            continue
        result[name] = palette_of(path)
    print(json.dumps(result, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
