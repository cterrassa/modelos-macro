# Laboratorio interactivo de modelos macroeconómicos

Simuladores teóricos de los modelos vistos en el curso de Macroeconomía
(Maestría en Economía Aplicada · Universidad de los Andes). Cada modelo
está implementado como una pestaña independiente con sliders para hacer
estática comparativa, gráficas SVG con curvas, flechas de movimiento y
áreas sombreadas, panel de ecuaciones de equilibrio con sustitución
término a término, y tabla numérica con deltas.

**Sin datos reales** — todos los escenarios usan unidades normalizadas y
sirven exclusivamente como herramienta académica para visualizar los
efectos de los choques en cada modelo teórico.

## Modelos incluidos

| # | Pestaña | Presentaciones |
|---|---|---|
| 1 | Identidad del PIB y gasto agregado | 05–07 |
| 2 | Economía cerrada LP: ingreso y factores | 08 |
| 3 | Economía cerrada LP: gasto, ahorro e inversión | 09–11 |
| 4 | Oferta monetaria y multiplicador bancario | 12–14 |
| 5 | Dinero, inflación, Fisher y Baumol-Tobin | 15–17 |
| 6 | Economía abierta pequeña LP | 19–21 |
| 7 | Economía abierta grande LP (3 gráficas conectadas) | 22 |
| 8 | Empleo, desempleo natural y rigidez salarial | 23–25 |
| 9 | Ciclos, DA-OA y Ley de Okun | 27 |
| 10 | IS y cruz keynesiana | 29, 31 |
| 11 | LM y preferencia por liquidez | 32 |
| 12 | IS-LM | 33 |
| 13 | IS-LM y demanda agregada | 34 |
| 14 | Mundell-Fleming (flexible / fijo) | 34–36 |

## Cómo se usa

Mover los sliders del panel izquierdo. La aplicación recalcula todo en
vivo y muestra:

- Las curvas se redibujan; el área sombreada entre la curva base y la
  nueva indica el desplazamiento.
- Una flecha del equilibrio anterior al nuevo muestra hacia dónde se
  movió.
- En las gráficas conectadas, líneas guía punteadas resaltan las
  variables compartidas (`r`, `q`, `CF`, etc.).
- El panel "Ecuaciones de equilibrio" muestra cada fórmula sustituida
  con los valores `BASE` y `NUEVO`; los términos que cambian aparecen
  en verde si suben y en rojo si bajan.
- "Secuencia del choque" describe en lenguaje natural el orden de los
  ajustes.
- "Tabla numérica" cierra con los deltas de cada variable endógena.

## Estructura

```
macro-modelos-app/
├── index.html      # punto de entrada
├── app.js          # 14 modelos, render de gráficas SVG, equations panel
├── styles.css      # tema visual completo
└── README.md
```

No hay build, no hay dependencias, no hay backend. Es un sitio estático
puro.

## Correr localmente

Cualquier servidor HTTP estático sirve. Con Python (incluido en la
mayoría de instalaciones de Windows / macOS / Linux):

```bash
python -m http.server 4173
```

Luego abre `http://127.0.0.1:4173/` en el navegador.

También funciona doble-click directo a `index.html` en el navegador
(algunos navegadores limitan ciertas funciones SVG si se abre como
`file://`, pero la app principal funciona).

## Despliegue

Es un sitio estático, así que cualquier hosting estático funciona:
GitHub Pages, Render, Netlify, Cloudflare Pages, Vercel, etc.

## Licencia

Material académico para uso educativo. Las ecuaciones y modelos
provienen del curso de Macroeconomía y de Mankiw (2019, 2021).
