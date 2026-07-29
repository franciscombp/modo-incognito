#!/usr/bin/env python3
"""Servidor local del juego, sin npm ni node.

Pensado para máquinas con hardening donde no se puede instalar nada: solo
necesita el Python que ya trae el sistema.

    python3 serve.py            -> http://localhost:8000
    python3 serve.py 9000       -> otro puerto

Sirve la raíz del repositorio, que contiene el juego ya compilado
(index.html, assets/, sprites/, data/). Para editar contenido no hace falta
compilar nada: toca los JSON de `data/` o los PNG de `sprites/` y recarga el
navegador. Los cambios en `pixel-office/src/` sí necesitan `npm run build`.

Nota: abrir index.html con doble clic (file://) NO funciona — el navegador
bloquea los módulos y la carga de los JSON. Por eso este servidor.
"""

import http.server
import os
import socketserver
import sys
import webbrowser
from pathlib import Path

ROOT = Path(__file__).resolve().parent
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8000


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def end_headers(self):
        # El contenido se edita en caliente: nunca sirvas una copia cacheada.
        self.send_header("Cache-Control", "no-store, max-age=0")
        super().end_headers()

    def log_message(self, fmt, *args):
        if "304" in fmt % args:
            return
        super().log_message(fmt, *args)


def main():
    if not (ROOT / "index.html").exists():
        print("No encuentro index.html en la raíz del repo.")
        print("Genera el build con:  cd pixel-office && npm run build:pages")
        return 1

    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("", PORT), Handler) as httpd:
        url = f"http://localhost:{PORT}/"
        print(f"Modo Incógnito en {url}")
        print("Edita data/*.json o sprites/*.png y recarga. Ctrl+C para salir.")
        if os.environ.get("NO_BROWSER") != "1":
            try:
                webbrowser.open(url)
            except Exception:
                pass
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nHasta luego.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
