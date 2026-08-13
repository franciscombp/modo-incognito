# Documentación de diseño

El código va detrás de estos documentos, no al revés. Si algo no cuadra, se
corrige **aquí primero** y luego se implementa.

> **Para verlo, no leerlo:** el juego está en
> <https://franciscombp.github.io/modo-incognito/> y los builders se abren con
> un clic desde ahí mismo —
> [mapas](https://franciscombp.github.io/modo-incognito/creador/mapas/) ·
> [personajes](https://franciscombp.github.io/modo-incognito/creador/personajes/) ·
> [música](https://franciscombp.github.io/modo-incognito/creador/musica/) ·
> [pantallas](https://franciscombp.github.io/modo-incognito/creador/pantallas/).
> El mapa del repo (y los invariantes) está en
> [`CLAUDE.md`](../CLAUDE.md); el «quiero cambiar X → edito Y», en el
> [`README.md`](../README.md).

| Documento | De qué va | Estado |
|---|---|---|
| [`MOTOR.md`](MOTOR.md) | Las reglas del bucle: sospecha, jefe, lugares seguros, escondites. El porqué de cada número | **Vivo** — describe lo implementado |
| [`CAMPANA.md`](CAMPANA.md) | La carrera: misiones encadenadas, Qués y Cómos, temporadas, rangos, jubilación, RRHH | **Parcial** — temporada 1 jugable; 2–5 sin escribir |
| [`HUD.md`](HUD.md) | La interfaz DURANTE la partida: placa de identidad, lista de tareas, pausa | **Parcial** — placa, misiones, reloj y zona en juego; pausa por hacer |
| [`PANTALLAS.md`](PANTALLAS.md) | El lienzo fijo 1920×1080 y las pantallas que no son la partida: selección de personaje, evaluación, RRHH | **Parcial** — lienzo y RRHH hechos; expediente y evaluación por hacer |
| [`ARTE.md`](ARTE.md) | El reparto de archivos entre el frente de arte y el de motor, para trabajar en paralelo sin pisarse | **Vivo** — léelo antes de abrir nada |
| [`referencias/`](referencias/) | Las capturas que fijan el rumbo, con qué copiar de cada una | — |

Cada documento abre con su propia tabla de **qué está construido y qué no**,
archivo por archivo. Esa tabla es la verdad; esta de aquí es el resumen.

## Cómo se relacionan

```
        MOTOR.md ─── el bucle de sigilo (no cambia)
            │
        CAMPANA.md ── qué se te pide dentro del bucle
            │
      ┌─────┴─────┐
   HUD.md    PANTALLAS.md
  (en juego)  (menús + lienzo)
```

`PANTALLAS.md` §1 (el lienzo fijo) es **la base de las otras dos**: hasta que
eso esté, cualquier pantalla nueva se construiría contra un suelo que va a
cambiar. **Ya está**, así que ese bloqueo se levantó: lo que se construya
ahora se mide en píxeles de 1920×1080 y no vuelve a moverse.

## Convenciones

- **Nada se implementa sin estar aquí.** Y nada se queda aquí sin marcar si
  está hecho o no.
- Cada documento acaba con **preguntas abiertas** y **notas sueltas**: ese es
  el sitio para responder sin escribir un mensaje.
- Los ⚠️ marcan lo que ya se sabe que va a doler. Los 📌, lo que está sin
  decidir.
