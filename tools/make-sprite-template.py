#!/usr/bin/env python3
"""Genera las PLANTILLAS para dibujar un personaje nuevo.

Salen dos PNG en `art/plantillas/`, a la resolucion exacta que espera el motor
(4x4 celdas de 128x176, o sea 512x704):

  plantilla-camina.png    · el ciclo de caminar, una fila por direccion
  plantilla-acciones.png  · 8 poses de 2 fotogramas cada una

Cada celda lleva escrito qué va dentro y una silueta guia con la linea del
suelo, la altura de los ojos y el ancho util, para que todos los personajes
salgan a la misma escala. El fondo es transparente salvo las guias, que van en
un color plano facil de borrar (o de dejar en una capa aparte).

Las guias NO se dibujan en el arte final: son para pintar encima y borrarlas.
Si prefieres partir de un lienzo limpio, usa --sin-guias.

    python3 tools/make-sprite-template.py
    python3 tools/make-sprite-template.py --sin-guias
"""
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

OUT = Path(__file__).resolve().parent.parent / "art" / "plantillas"
COLS, ROWS = 4, 4
CELL_W, CELL_H = 128, 176
FOOT_MARGIN = 4

GUIDE = (69, 224, 208, 90)
GUIDE_SOFT = (69, 224, 208, 40)
TEXT = (255, 210, 120, 220)
GRID = (255, 255, 255, 55)

# Las mismas proporciones que usa pack-sprites.py al encajar el arte.
EYE_LINE = 0.82  # altura de los ojos, medida desde los pies
BODY_W = 0.62  # ancho util de la figura, sobre el ancho de celda

WALK = [
    ("SUR · de frente", ["paso 1", "paso 2", "paso 3", "paso 4"]),
    ("OESTE · hacia la izquierda", ["paso 1", "paso 2", "paso 3", "paso 4"]),
    ("ESTE · hacia la derecha", ["paso 1", "paso 2", "paso 3", "paso 4"]),
    ("NORTE · de espaldas", ["paso 1", "paso 2", "paso 3", "paso 4"]),
]

# Orden de poses: el mismo que espera el rig (data/sprites/<id>.json). Los
# nombres son los de Giuli; para otro personaje cambian los nombres en su
# JSON, pero NO el sitio: pose 0 va arriba a la izquierda, y cada pose ocupa
# dos celdas seguidas.
ACTIONS = [
    ("pose 0 · work", "trabajando"),
    ("pose 1 · sleep", "dormida"),
    ("pose 2 · coffee", "tomando cafe"),
    ("pose 3 · eat", "comiendo"),
    ("pose 4 · movie", "viendo peli"),
    ("pose 5 · phone", "con el movil"),
    ("pose 6 · scared", "susto"),
    ("pose 7 · shrug", "que mas da"),
]


def font(size):
    for name in (
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    ):
        if Path(name).exists():
            return ImageFont.truetype(name, size)
    return ImageFont.load_default()


def cell_guides(d, x, y):
    """Suelo, linea de ojos y ancho util dentro de una celda."""
    floor = y + CELL_H - FOOT_MARGIN
    eyes = floor - int((CELL_H - FOOT_MARGIN) * EYE_LINE)
    half = int(CELL_W * BODY_W / 2)
    cx = x + CELL_W // 2

    d.line([(x + 6, floor), (x + CELL_W - 6, floor)], fill=GUIDE, width=1)
    d.line([(x + 18, eyes), (x + CELL_W - 18, eyes)], fill=GUIDE_SOFT, width=1)
    d.line([(cx - half, y + 10), (cx - half, floor)], fill=GUIDE_SOFT, width=1)
    d.line([(cx + half, y + 10), (cx + half, floor)], fill=GUIDE_SOFT, width=1)
    d.line([(cx, floor - 6), (cx, floor + 2)], fill=GUIDE, width=1)


def build(path, title, labels, guides=True):
    """`labels` es una lista de (titulo, subtitulo) por celda, 16 en total."""
    img = Image.new("RGBA", (CELL_W * COLS, CELL_H * ROWS), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    f_small = font(10)
    f_tiny = font(9)

    for i, (head, sub) in enumerate(labels):
        x = (i % COLS) * CELL_W
        y = (i // COLS) * CELL_H
        d.rectangle([x, y, x + CELL_W - 1, y + CELL_H - 1], outline=GRID)
        if guides:
            cell_guides(d, x, y)
        d.text((x + 5, y + 4), head, font=f_small, fill=TEXT)
        if sub:
            d.text((x + 5, y + 17), sub, font=f_tiny, fill=GUIDE)

    OUT.mkdir(parents=True, exist_ok=True)
    img.save(OUT / path)
    print(f"  {path}: {img.width}x{img.height}  ({title})")


if __name__ == "__main__":
    guides = "--sin-guias" not in sys.argv

    walk_labels = []
    for direction, steps in WALK:
        for j, step in enumerate(steps):
            walk_labels.append((step, direction if j == 0 else ""))

    action_labels = []
    for head, sub in ACTIONS:
        action_labels.append((f"{head}", sub))
        action_labels.append(("  fotograma 2", "(el mismo, movido)"))

    print(f"Plantillas de {CELL_W}x{CELL_H} por celda, rejilla {COLS}x{ROWS}:")
    build("plantilla-camina.png", "ciclo de caminar", walk_labels, guides)
    build("plantilla-acciones.png", "8 poses x 2 fotogramas", action_labels, guides)
    print(f"En {OUT}")
