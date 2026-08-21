# Qué está y qué falta — el mapa de pendientes

**Para qué es este documento.** Es la vista ÚNICA del estado del juego: qué se
puede jugar hoy, qué guardias lo protegen, y qué queda por construir en qué
orden. Cada documento de diseño (`MOTOR.md`, `CAMPANA.md`, `HUD.md`,
`PANTALLAS.md`) sigue siendo el dueño de SU detalle — aquí solo se junta la
foto, con enlaces. Si construyes algo de esta lista, táchalo AQUÍ y actualiza
la tabla del documento dueño en el mismo commit.

---

## 1. Lo que se juega HOY (publicado en `main`)

**Días 1 y 2, de punta a punta.** Lo vigilan `check:partida` (el lunes
entero) y `check:dia2` (el arco lunes → martes, con la evaluación en medio).

- **Lunes**: ascensor → Gabo te recibe en la puerta y TE LLEVA a tu puesto
  (cinemática **andando y hablando**: te va contando el piso en globos, se
  ACOMPASA a tu paso —afloja si te descuelgas, se para y te llama si te
  pierdes— y al llegar se aparta para que te sientes) → Crispo se presenta →
  la cadena de la temporada 1 (fingir, estirar-baile, café-examen-verter, el
  chisme de Fran, la peli, la comida) → a las seis, el ascensor.
- **Martes**: sin puerta — Gabo de ronda desde el primer minuto, el cruce de
  la avenida activo, la cadena continúa donde el lunes la dejó.
- **Días 3–5**: los JSON existen (`levels/dia-3..5`) pero NO están en
  `manifest.json → levels`. Activar uno es añadir su id a esa lista — y
  pasarle `check:contenido` + un arco como el de `check-dia2`.

**Las reglas de oro vigentes** (cada una con su porqué en el doc dueño):

| Regla | Doc | Guardia |
|---|---|---|
| **NADIE se queda trabado**: un solo caminar por navmesh, que bordea, rehace el plan si el blanco se mueve, y si no puede llegar lo DICE | MOTOR §3.6bis | `check:atascos` |
| **Se camina MIENTRAS se habla**: la caja pausa, el globo no | MOTOR §6.1 | `check:escolta` |
| Nada juega al PULSO: toda actividad declara verbo interactivo (la siesta es la única excepción — dormir es quedarse quieta) | MOTOR §2 | `check:contenido` |
| Sentada trabajando NADIE te toca (ni el jefe ni el «fantasma de la silla») | MOTOR §4 | `check:safespots` |
| La escolta de apertura es una CINEMÁTICA: se acompasa a ti, frena al llegar y se aparta | MOTOR §3.6ter | `check:escolta` |
| El juego entero se juega con teclado O con palanca+botón (menús, diálogos, baile incluidos) | HUD | `check:pulgar`, `check:baile-pulgar`, `check:mandos` |
| Hablar con la fuente de un encargo va AL GRANO (el examen antes que la charla) | CAMPANA §3 | `check:objetos` |
| La conversación se VE: soliloquio en primer plano, dúo en plano medio SOBRE la caja | HUD | captura + `check:apertura` |
| Las tres amonestaciones son una ESCALADA determinista y la tercera se juega | MOTOR §8 | `check:amonestaciones` |
| Nada del HUD se pisa con nada (medido, no mirado) | HUD | `check:encimados` |

## 2. Pendiente de CONTENIDO (JSON, sin tocar motor)

1. **Temporadas 2–5** — `campaign/temporada-2..5.json` no existen; hoy los
   ascensos reusan las misiones de la 1. Es EL pendiente grande de juego:
   sin ellas la carrera de 25 años es un bucle de una semana. (CAMPANA §5)
2. **Días 3–5 en el manifiesto** — contenido ya escrito; activar + validar.
3. **Más fichas de chisme** (`chismes.json`) — ahora las lee también la
   reunión fantasma; el pozo se nota corto en una sesión larga.
4. **Escenas de bienvenida para Chispita y Washo** — Crispo ya se presenta
   en persona; los otros dos se conocen «de choque». (`encounters.*.escenas`)
5. **Steven el Daddy como arco** — hoy es narrador de Teams; CAMPANA lo
   quiere con encargos propios.

## 3. Pendiente de INTERFAZ

1. **La pausa por pestañas** (HUD §4.5) — la leyenda de mandos ya es
   permanente; las pestañas (ajustes / mapa / libreta en un mismo panel)
   siguen siendo pantallas sueltas.
2. **Selección de personaje como EXPEDIENTE** (PANTALLAS §2) — sigue el
   login anterior; el diseño nuevo está escrito y sin construir.
3. **«El escenario ES el menú»** (PANTALLAS §1.8bis) — dirección aprobada,
   por construir: título sobre el ascensor real, transiciones con puertas.
4. **El bisel común** (`--cut`, HUD §4.6) y **paneles con CSS 3D**
   (PANTALLAS §1.8) — cosmética estructural, baja prioridad.
5. **Prompt de acción contextual** (HUD §4.4) — hoy solo el botón táctil.

## 4. Pendiente de MOTOR

1. **El globo de habla solo lo usa la escolta** — el canal existe
   (`ui/speechBubble.js`) y `dialogues.barks` lleva desde siempre siendo dato
   MUERTO. Colgarle los barks de pasillo es contenido casi gratis: el
   figurante que comenta al pasar, el secuaz que refunfuña.
2. **Los NPC no se esquivan entre ellos AL PLANIFICAR** (MOTOR §3.6bis 📌) —
   se apartan por separación de cuerpos y ahora se BORDEAN al caminar, pero
   dos que van al mismo sitio siguen negociándolo a empujones en vez de
   trazar la ruta contando con el otro.
3. **Reactivar el cruce en el día 1** — decidido que NO por ahora (foco en
   el piso); el día 2 ya lo trae. Si se quiere de vuelta: renombrar
   `$minigame` → `minigame` en `dia-1.json`.
4. **`por-temporada` como recurrencia** (CAMPANA §3.3) — declarado en el
   diseño, sin uso todavía.

## 5. Deuda de VERIFICACIÓN

1. **`check:dia2` completa por API** los desbloqueos calientes — un arco
   jugado con verbos de verdad (como hace `check:partida` con el lunes)
   sería más honesto para el martes.
2. **Banco de pruebas** (`creador/pruebas/`) — le faltan estados: la
   evaluación, la jubilación, el telón.
3. **Capturas de la cámara de diálogo** — hoy se validan a ojo; un
   `check:encuadre` que proyecte a los dos hablantes y exija que caigan
   dentro del cuadro y fuera de la caja sería la guardia que falta.

## 6. El orden que recomendamos (si se sigue construyendo)

1. Jugar a mano los días 1–2 en el teléfono (el punto ciego de la suite es
   el TACTO real).
2. Temporada 2 (contenido) + activar día 3 — alarga la vida real del juego.
3. La pausa por pestañas — el pendiente de interfaz que más se nota jugando.
4. Selección de personaje como expediente — la última pantalla «de otro
   juego».
5. Steven como arco + más chismes — profundidad, no anchura.
