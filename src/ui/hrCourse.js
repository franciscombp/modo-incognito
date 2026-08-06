import { iconEl } from "./icons.js";

/**
 * EL CURSO DE RRHH (docs/CAMPANA.md §7.2) — el castigo de la tercera
 * amonestación. Ya no te despiden: te mandan a un curso obligatorio de
 * cumplimiento, horas de vídeo corporativo… con un botón de SALTAR que se
 * mueve. El reto es cazarlo para volver al juego.
 *
 * Es el único minijuego donde quieres saltarte el contenido y el juego te
 * lo pone difícil — eso ES la sátira, no un chiste encima de ella. Todo el
 * mundo reconoce el patrón: el skip que aparece tarde, la barra que avanza
 * más lento de lo que debería, el «¿sigues ahí?».
 *
 * Reglas de diseño que no se rompen:
 * · SIEMPRE se puede terminar. Es un peaje, no otra derrota: cazar el
 *   botón N veces (o aguantar el vídeo entero) te devuelve al piso.
 * · ESCALA con la reincidencia (save flag `rrhh`): la primera vez el botón
 *   pasea; a partir de la segunda, HUYE del cursor.
 * · El "vídeo" es un canvas procedural: cero archivos, como todo el audio.
 *   Sus colores salen de los TOKENS del tema, leídos del documento igual que
 *   hace `scene/palette.js` con el edificio — un canvas no tiene cascada, así
 *   que si se escriben a mano son el único sitio del proyecto que no cambia
 *   al cambiar de tema, y se nota justo al lado de la tarjeta que sí cambia.
 */

/**
 * Lee un token del documento.
 *
 * SIN color de reserva escrito aquí, a propósito: la capa semántica del
 * design system es un CONTRATO —`--text`, `--bg`, `--accent` existen en todos
 * los temas— y meter un hex "por si acaso" es exactamente cómo un color
 * acaba viviendo en dos sitios. Si alguna vez falta, se ve en consola y se
 * arregla en la capa 1, que es donde va.
 */
function tok(name) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  if (!v) console.warn(`[hrCourse] falta el token ${name} en el tema`);
  return v || "transparent";
}

const FRASES = [
  "Bienvenidos al Módulo 7: Sinergia y Compromiso",
  "Nuestros valores nos definen como familia",
  "El cumplimiento es tarea de todos",
  "Recuerda: la cámara de tu laptop es tu amiga",
  "Un espacio de trabajo ordenado es una mente ordenada",
  "La puntualidad es la cortesía de los campeones",
  "Este contenido no puede adelantarse",
];

export function createHrCourse(root) {
  return {
    /**
     * Corre el curso entero y resuelve cuando la jugadora escapa.
     * `strikes` = visitas anteriores a RRHH (escala la crueldad).
     */
    play({ strikes = 0 } = {}) {
      return new Promise((resolve) => {
        const layer = document.createElement("div");
        layer.className = "inc-hr";
        root.appendChild(layer);

        const card = document.createElement("div");
        card.className = "inc-hr-card";
        layer.appendChild(card);

        const head = document.createElement("div");
        head.className = "inc-hr-head";
        head.textContent = "RRHH · CURSO OBLIGATORIO DE CUMPLIMIENTO";
        card.appendChild(head);

        const video = document.createElement("canvas");
        video.className = "inc-hr-video";
        video.width = 640;
        video.height = 300;
        card.appendChild(video);
        const ctx = video.getContext("2d");

        const barWrap = document.createElement("div");
        barWrap.className = "inc-hr-bar";
        const bar = document.createElement("i");
        barWrap.appendChild(bar);
        card.appendChild(barWrap);

        const foot = document.createElement("div");
        foot.className = "inc-hr-foot";
        foot.textContent = `Reproduciendo 1 de 14 vídeos · visita n.º ${strikes + 1}`;
        card.appendChild(foot);

        const skip = document.createElement("button");
        skip.className = "inc-hr-skip";
        skip.type = "button";
        const needed = Math.min(3 + strikes, 6);
        let caught = 0;
        const skipLabel = () => `Saltar introducción (${caught}/${needed})`;
        skip.textContent = skipLabel();
        card.appendChild(skip);

        // ── El botón se MUEVE ──
        // 1.ª visita: pasea solo, a su ritmo. Reincidencia: además HUYE del
        // cursor. Siempre dentro de la tarjeta: inalcanzable no es gracioso.
        function teleport() {
          const pad = 16;
          const maxX = card.clientWidth - skip.offsetWidth - pad;
          const maxY = card.clientHeight - skip.offsetHeight - pad;
          skip.style.left = `${pad + Math.random() * Math.max(1, maxX - pad)}px`;
          skip.style.top = `${pad + Math.random() * Math.max(1, maxY - pad)}px`;
        }
        const wanderMs = Math.max(650, 1600 - strikes * 300);
        let wander = setInterval(teleport, wanderMs);
        teleport();

        if (strikes >= 1) {
          card.addEventListener("pointermove", (e) => {
            const r = skip.getBoundingClientRect();
            const dx = e.clientX - (r.left + r.width / 2);
            const dy = e.clientY - (r.top + r.height / 2);
            if (Math.hypot(dx, dy) < 90) teleport();
          });
        }

        // ── El "vídeo" corporativo ──
        let t = 0;
        let frase = 0;
        let raf = 0;
        const t0 = performance.now();
        // Los colores del "vídeo", del tema. Se leen UNA vez por curso: el
        // tema no cambia a mitad de un castigo, y hacerlo por frame sería
        // pedirle al navegador que recalcule estilos 60 veces por segundo.
        const COL = {
          fondoA: tok("--surface-solid", "#16242f"),
          fondoB: tok("--bg", "#0d1620"),
          burbuja: tok("--accent", "#7fd8cf"),
          tinta: tok("--text", "#e5f9f7"),
        };
        // La barra avanza MÁS LENTO de lo que debería: el chiste del
        // reproductor corporativo. Aguantarlo entero también libera.
        const VIDEO_S = 45 + strikes * 15;
        function draw(now) {
          raf = requestAnimationFrame(draw);
          t = (now - t0) / 1000;
          // "diapositiva": degradado suave + burbujas decorativas
          const g = ctx.createLinearGradient(0, 0, 640, 300);
          g.addColorStop(0, COL.fondoA);
          g.addColorStop(1, COL.fondoB);
          ctx.globalAlpha = 1;
          ctx.fillStyle = g;
          ctx.fillRect(0, 0, 640, 300);
          // La transparencia va por `globalAlpha` y no metida en el color: un
          // token resuelve a `hsl(...)` y no hay dónde colarle el alfa.
          ctx.fillStyle = COL.burbuja;
          for (let i = 0; i < 5; i++) {
            ctx.globalAlpha = 0.05 + (i % 3) * 0.02;
            ctx.beginPath();
            ctx.arc(90 + i * 120 + Math.sin(t * 0.5 + i) * 14, 150 + Math.cos(t * 0.4 + i * 2) * 40, 26, 0, Math.PI * 2);
            ctx.fill();
          }
          if (Math.floor(t / 5) % FRASES.length !== frase) frase = Math.floor(t / 5) % FRASES.length;
          ctx.fillStyle = COL.tinta;
          ctx.textAlign = "center";
          ctx.globalAlpha = 0.85;
          ctx.font = "600 20px system-ui, sans-serif";
          ctx.fillText(FRASES[frase], 320, 150, 600);
          ctx.globalAlpha = 0.4;
          ctx.font = "12px system-ui, sans-serif";
          ctx.fillText("© Corporativo · prohibida su reproducción (aun así, es obligatoria)", 320, 282);
          ctx.globalAlpha = 1;
          // barra perezosa: el 70% de la velocidad real
          bar.style.width = `${Math.min(100, ((t * 0.7) / VIDEO_S) * 100)}%`;
          if (t * 0.7 >= VIDEO_S) done();
        }
        raf = requestAnimationFrame(draw);

        function done() {
          cancelAnimationFrame(raf);
          clearInterval(wander);
          // El certificado: medio segundo de gloria burocrática.
          card.replaceChildren();
          const cert = document.createElement("div");
          cert.className = "inc-hr-cert";
          const ic = document.createElement("div");
          ic.className = "inc-hr-cert-icon";
          ic.appendChild(iconEl("check"));
          cert.appendChild(ic);
          const tt = document.createElement("div");
          tt.className = "inc-hr-cert-title";
          tt.textContent = "CERTIFICADO DE CUMPLIMIENTO";
          cert.appendChild(tt);
          const ss = document.createElement("div");
          ss.className = "inc-hr-cert-sub";
          ss.textContent = "Válido hasta tu próxima amonestación. Vuelve al piso.";
          cert.appendChild(ss);
          card.appendChild(cert);
          setTimeout(() => {
            layer.remove();
            resolve();
          }, 1900);
        }

        skip.addEventListener("click", () => {
          caught += 1;
          skip.textContent = skipLabel();
          if (caught >= needed) done();
          else teleport();
        });
      });
    },
  };
}
