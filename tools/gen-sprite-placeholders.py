#!/usr/bin/env python3
"""
Genera placeholders de sprites 4x4 (512x704 px, celdas de 128x176) para personajes sin arte.
Cada placeholder es un bloque de color con un ícono de letra.
"""

from PIL import Image, ImageDraw, ImageFont
import os

OUTPUT_DIR = "pixel-office/public/sprites"
os.makedirs(OUTPUT_DIR, exist_ok=True)

# Caracteres: (nombre_archivo, texto, color_fondo, color_texto)
PLACEHOLDERS = [
    ("reception", "R", "#2c5aa0", "#ffffff"),    # Recepción - azul
    ("narrator", "S", "#664d00", "#ffffff"),     # Steven el Daddy - marrón
    ("placeholder-1", "?", "#333333", "#45e0d0"),  # Genérico
    ("placeholder-2", "!", "#333333", "#ff4ecd"),  # Genérico
]

def create_placeholder(filename, icon, bg_color, text_color):
    """Crea un sprite 4x4 con placeholder de color."""
    # Cada celda es 128x176, rejilla 4x4
    width, height = 512, 704
    img = Image.new('RGBA', (width, height), (5, 6, 10, 255))  # Fondo game
    draw = ImageDraw.Draw(img)

    cell_w, cell_h = 128, 176

    # Llenar con patrón de color
    for row in range(4):
        for col in range(4):
            x = col * cell_w
            y = row * cell_h
            # Alternancia: oscuro/claro para efecto de sprite
            intensity = 0.8 if (row + col) % 2 else 1.0
            # Convertir hex a RGB
            bg = tuple(int(bg_color.lstrip('#')[i:i+2], 16) for i in (0, 2, 4))
            final_bg = tuple(int(c * intensity) for c in bg)
            draw.rectangle((x, y, x+cell_w, y+cell_h), fill=(*final_bg, 255))

            # Borde sutil
            draw.rectangle((x, y, x+cell_w-1, y+cell_h-1), outline=(100, 100, 100, 100))

    # Texto grande en el centro
    try:
        font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 120)
    except:
        font = ImageFont.load_default()

    text_color_rgb = tuple(int(text_color.lstrip('#')[i:i+2], 16) for i in (0, 2, 4))
    draw.text((width // 2, height // 2), icon, font=font, fill=(*text_color_rgb, 255), anchor="mm")

    # Guardar
    path = os.path.join(OUTPUT_DIR, f"{filename}.png")
    img.save(path, 'PNG')
    print(f"✓ {path}")

if __name__ == "__main__":
    for filename, icon, bg, text in PLACEHOLDERS:
        create_placeholder(filename, icon, bg, text)
    print(f"\n{len(PLACEHOLDERS)} placeholders creados en {OUTPUT_DIR}/")
