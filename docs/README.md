# Documentación de diseño

El código va detrás de estos documentos, no al revés. Si algo no cuadra, se
corrige **aquí primero** y luego se implementa.

| Documento | De qué va | Estado |
|---|---|---|
| [`MOTOR.md`](MOTOR.md) | Las reglas del bucle: sospecha, jefe, lugares seguros, escondites. El porqué de cada número | **Vivo** — describe lo implementado |
| [`CAMPANA.md`](CAMPANA.md) | La carrera: misiones encadenadas, Qués y Cómos, temporadas, rangos, jubilación, RRHH | **Diseño** — sin implementar |
| [`HUD.md`](HUD.md) | La interfaz DURANTE la partida: placa de identidad, lista de tareas, pausa | **Diseño** — sin implementar |
| [`PANTALLAS.md`](PANTALLAS.md) | El lienzo fijo 1920×1080 y las pantallas que no son la partida: selección de personaje, evaluación, RRHH | **Diseño** — sin implementar |
| [`referencias/`](referencias/) | Las capturas que fijan el rumbo, con qué copiar de cada una | — |

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
cambiar.

## Convenciones

- **Nada se implementa sin estar aquí.** Y nada se queda aquí sin marcar si
  está hecho o no.
- Cada documento acaba con **preguntas abiertas** y **notas sueltas**: ese es
  el sitio para responder sin escribir un mensaje.
- Los ⚠️ marcan lo que ya se sabe que va a doler. Los 📌, lo que está sin
  decidir.
