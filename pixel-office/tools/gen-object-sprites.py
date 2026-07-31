#!/usr/bin/env python3
"""
Genera sprites placeholders para objetos y autos.
Esto permite que el equipo suba sus propias texturas después.
"""

from PIL import Image, ImageDraw
import os

OUTPUT_DIR = "pixel-office/public/sprites"
os.makedirs(OUTPUT_DIR, exist_ok=True)

# Objetos: (nombre_archivo, tamaño, color, descripción)
OBJECTS = [
    ("car-placeholder", (256, 160), "#cc6600", "Auto/vehículo"),
    ("furniture-desk", (128, 96), "#8b6f47", "Escritorio"),
    ("furniture-table", (160, 160), "#8b6f47", "Mesa"),
    ("furniture-chair", (80, 80), "#6b5844", "Silla"),
    ("plant", (64, 96), "#2d5016", "Planta"),
    ("door", (64, 160), "#8b7355", "Puerta"),
    ("wall-panel", (32, 256), "#666666", "Panel mural"),
]

def create_object_placeholder(filename, size, color, label):
    """Crea un sprite placeholder para un objeto."""
    w, h = size
    img = Image.new('RGBA', (w, h), (5, 6, 10, 0))  # Fondo transparente
    draw = ImageDraw.Draw(img)

    # Color de fondo
    color_rgb = tuple(int(color.lstrip('#')[i:i+2], 16) for i in (0, 2, 4))
    draw.rectangle((0, 0, w-1, h-1), fill=(*color_rgb, 200), outline=(100, 100, 100, 100))

    # Patrón de grid para indicar que es placeholder
    for i in range(0, w, 16):
        draw.line((i, 0, i, h), fill=(255, 255, 255, 50))
    for i in range(0, h, 16):
        draw.line((0, i, w, i), fill=(255, 255, 255, 50))

    # Etiqueta (pequeña)
    try:
        font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", max(8, min(w, h) // 8))
    except:
        font = ImageFont.load_default()

    draw.text((w // 2, h // 2), label[:3].upper(), font=font, fill=(255, 255, 255, 150), anchor="mm")

    path = os.path.join(OUTPUT_DIR, f"{filename}.png")
    img.save(path, 'PNG')
    print(f"✓ {path} ({w}x{h}) - {label}")

if __name__ == "__main__":
    from PIL import ImageFont
    for filename, size, color, label in OBJECTS:
        create_object_placeholder(filename, size, color, label)
    print(f"\n{len(OBJECTS)} object sprites creados en {OUTPUT_DIR}/")
    print("\n💡 Reemplaza estos PNGs con tus propias texturas cuando esté el arte.")
