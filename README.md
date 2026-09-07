# Anexo de Jubilación Patronal (JP) y Bonificación por Desahucio (BD)

Aplicación local para automatizar la elaboración del Anexo de JP y BD utilizado en el análisis
tributario en Ecuador. Implementa los **32 pasos** del procedimiento
*"Proceso de Elaboración de Anexo de JP y BD (confidencial).xlsx"* (hoja `Resumen`).

---

## 1. Cómo se usa

**No requiere instalación, ni servidor propio, ni conexión permanente a internet una vez cargada la página.**

### Opción A — En el navegador, sin instalar nada (web)

Abra la página publicada con GitHub Pages:

**https://xavier6car.github.io/Anexo-de-estudio-actuariales/**

La pantalla completa de la aplicación viaja en esa única página. Al abrirla se descarga una vez y
a partir de ahí todo el procesamiento ocurre dentro de su propio navegador: los archivos que usted
cargue **no se suben a GitHub ni a ningún servidor**, se quedan en la memoria de esa pestaña.

### Opción B — Localmente, doble clic

1. Descargue `index.html` (o `dist/Anexo-JP-BD.html`, son el mismo archivo) del repositorio.
2. Ábralo con doble clic (Edge o Chrome).
3. Siga el flujo de trabajo que muestra el Dashboard.

El archivo es autocontenido (~1,1 MB): incluye la interfaz, el motor de cálculo y la librería de
lectura/escritura de Excel. Puede copiarse a otro equipo, enviarse por correo o guardarse sin
conexión: funciona igual con o sin internet.

### Flujo de trabajo

| # | Paso | Pantalla |
|---|------|----------|
| 1 | Cargar los informes actuariales (detalle de empleados) | Carga de información |
| 2 | Cargar los resúmenes actuariales de JP y BD | Carga de información |
| 3 | Cargar la información contable (sustento ERI/ORI) | Carga de información |
| 4 | Revisar y confirmar la homologación de empleados | Homologación |
| 5 | Configurar tarifas de IR, fondeo y reglas tributarias | Parámetros y reglas |
| 6 | Ejecutar el análisis | Procesamiento |
| 7 | Revisar alertas e inconsistencias | Alertas |
| 8 | Revisar los cálculos por empleado | Detalle del cálculo |
| 9 | Revisar conciliaciones, deducibilidad e impuestos diferidos | Resultados |
| 10 | Exportar el Anexo a Excel (17 pestañas) | Exportar |

En **Carga de información** hay un botón *Descargar plantillas* que genera un Excel con la
estructura esperada y las instrucciones de cada hoja.

---

## 2. Arquitectura

Módulos independientes, concatenados en el HTML final por `build.ps1`. El motor de reglas y el
motor de cálculo **no conocen la interfaz**: las reglas tributarias pueden actualizarse sin tocar
el código de presentación.

```
src/
  vendor/sheetjs.js        Lectura y escritura de Excel (SheetJS, Apache-2.0)
  app/
    01-config.js           Parámetros y reglas tributarias por defecto + persistencia
    02-rules.js            Motor de reglas tributarias (evaluación y validación de cobertura)
    03-normalize.js        Normalización de nombres y homologación de empleados
    04-loader.js           Lectura de archivos, detección de encabezados y mapeo de columnas
    05-engine.js           Motor de cálculo: los 32 pasos del procedimiento
    06-validations.js      Catálogo de alertas y su clasificación
    07-reconcile.js        Conciliaciones contra resúmenes actuariales y entre años
    08-trace.js            Trazabilidad (reconstrucción de fórmulas bajo demanda)
    09-export.js           Exportación a Excel con 17 pestañas
    10-tests.js            20 casos de prueba (esperado vs. calculado)
    11-ui.js               Interfaz: navegación, carga, homologación, parámetros, proceso
    12-ui-resultados.js    Interfaz: resultados, alertas, trazabilidad, pruebas, exportación
  ui/
    styles.css
    index.template.html
build.ps1                  Compila src/ en dist/Anexo-JP-BD.html e index.html (raíz)
dist/Anexo-JP-BD.html      Entregable (copia de trabajo)
index.html                 Copia idéntica en la raíz: es lo que sirve GitHub Pages
```

### Recompilar

Tras modificar cualquier archivo de `src/`, regenere ambas copias (`dist/` y `index.html`) con:

```bash
powershell -ExecutionPolicy Bypass -File build.ps1
```

y suba los cambios (`git add -A && git commit -m "..." && git push`) para que la versión web se
actualice.

### Modelo de datos

Una fila de cálculo por **empleado × régimen (JP/BD) × año**. Campos por fila:

- **Identificación:** `empleado_id`, `nombre_original`, `nombre_norm`, `cedula`, `sexo`, `edad`, `ts`
- **Status:** `status`, `status_origen`, `cruce`, `cruce_detalle`
- **Movimiento:** `pasivo_inicial`, `costo_laboral`, `interes_financiero`, `incremento`,
  `costo_servicios_pasados`, `ori`, `traspasos`, `pagos`, `salidas_anticipadas`,
  `pasivo_final`, `pasivo_final_formula`, `dif_pasivo_final`
- **Tributario:** `regla_id`, `regla_estado`, `deducible`, `aplica_id`, `tratamiento`, `fondeo`
- **Movimiento deducible:** `mov_eri`, `mov_ori`, `saldo_deducible`, `saldo_no_deducible`
- **Salidas:** `salida_anticipada`, `salida_eri`, `salida_ori`, `clasificacion_estado`,
  `clasificacion_fuente`, `ingreso_gravado`, `ingreso_no_gravado`
- **ORI negativo:** `ori_negativo`, `por_compensar_anterior`, `saldo_2017_compensado`,
  `saldo_2017_por_compensar`, `considerar_en_diferido`, `ingreso_gravado_adicional`
- **Impuesto diferido:** `eri_id`, `ori_neto`, `total_dif_temporaria`, `tarifa_ir`, `id_eri`,
  `id_ori`, `rev_aid_eri`, `rev_aid_ori`, `saldo_dif_eri`, `saldo_dif_ori`, `saldo_dif_activo`,
  `base_id_acumulada`, `pago_con_cargo_provision`, `deduccion_adicional`

---

## 3. Correspondencia con el procedimiento

| Paso Excel | Celda | Implementación |
|---|---|---|
| 1 Ingreso de información | C7-C8 | `04-loader.js` — mapeo de columnas con sinónimos |
| 2 Status laboral y Cruce | C9, D9 | `05-engine.js` `determinarStatus` / `calcularCruce` |
| 3 Resúmenes actuariales | C10 | `04-loader.js` `construirRegistrosResumen` |
| 4 Resumen unificado + conciliación | C13, D13 | `05-engine.js` + `07-reconcile.js` |
| 5 Tratamiento tributario JP y BD | C14-C24 | `02-rules.js` + reglas en `01-config.js` |
| 6 Movimiento de valores deducibles | C26-C31 | `mov_eri`, `mov_ori`, `saldo_deducible`, `saldo_no_deducible` |
| 7 Salidas anticipadas | C33 | `salida_anticipada` |
| 8 Registro ERI/ORI de la salida | C34, D34 | `clasificacion_estado` + carga contable |
| 9 Ingreso no gravado | C35 | `ingreso_no_gravado` |
| 10 Ingreso gravado | C36 | `ingreso_gravado` |
| 11 Pago con cargo a la provisión | C38, D38 | `pago_con_cargo_provision` |
| 12 Deducción adicional (reverso en CCT) | C39, D39 | `deduccion_adicional` |
| 13 Saldo al 31-12 del año base | C41, D41 | semilla `por_compensar` |
| 14 ORI negativo | C42 | `ori_negativo` |
| 15 Saldo compensado | C43, D43 | `saldo_2017_compensado` |
| 16 Saldo por compensar | C44 | `saldo_2017_por_compensar` |
| 17 Considerar en diferido | C45 | `considerar_en_diferido` |
| 18 ERI del análisis de ID | C47, D47 | `eri_id` |
| 19 ORI neto | C48 | `ori_neto` |
| 20 Total diferencia temporaria | C49-C59 | `total_dif_temporaria` + reglas de ID |
| 21 Tarifa IR | C60 | `cfg.tarifas_ir` (parámetro obligatorio) |
| 22 Impuesto diferido ERI | C61 | `id_eri` |
| 23 Impuesto diferido ORI | C62 | `id_ori` |
| 24 Reversión AID ERI | C63 | `rev_aid_eri` |
| 25 Reversión AID ORI | C64 | `rev_aid_ori` |
| 26 Saldo diferido ERI | C65, D65 | `saldo_dif_eri` |
| 27 Saldo diferido ORI | C66, D66 | `saldo_dif_ori` |
| 28 Saldo diferido activo | C67 | `saldo_dif_activo` |
| 29 Saldo deducible al 31-12 del año base | C69, D69 | semilla `por_compensar` |
| 30 Empleado activo | C70 | `empleado_activo_iga` |
| 31 ORI negativo | C71 | `ori_negativo` |
| 32 Ingreso gravado adicional | C72 | `ingreso_gravado_adicional` |

---

## 4. Reglas tributarias cargadas

Son **datos, no código**. Se editan en *Parámetros y reglas*, se exportan/importan como JSON y
persisten en el navegador. Se aplica la **primera regla que coincide**.

### Jubilación Patronal

| Id | Años | Condición | Deducible | Impuesto diferido | Estado |
|---|---|---|---|---|---|
| JP-01 | hasta 2017 | TS ≥ 10 | Sí | No | Confirmada |
| JP-02 | hasta 2017 | TS < 10 | No | No | Confirmada |
| JP-03 | 2018–2020 | — | No | Sí | Confirmada |
| JP-04 | 2021 | TS ≥ 10, con fondeo | Sí | No | Confirmada |
| JP-05 | 2021 | TS ≥ 10, sin fondeo | No | Sí | Confirmada |
| JP-06 | 2021 | TS < 10 | No | No | Confirmada |
| JP-07 | 2022–2023 | — | No | Sí | **Consulta vinculante** |

### Bonificación por Desahucio

| Id | Años | Deducible | Impuesto diferido | Estado |
|---|---|---|---|---|
| BD-01 | hasta 2010 | No | No | Confirmada |
| BD-02 | 2011–2017 | Sí | No | Confirmada |
| BD-03 | 2018–2020 | No | Sí | Confirmada |
| BD-04 | 2021 | Sí | No | Confirmada |
| BD-05 | 2022–2023 | No | Sí | **Consulta vinculante** |

Para un año sin regla aplicable (por ejemplo 2024) el tratamiento queda en **NO DETERMINADO** y se
emite alerta crítica. El programa nunca asume un resultado tributario.

---

## 5. Reglas ambiguas identificadas

El Excel es un procedimiento narrativo: varios puntos no quedan cerrados. Ninguno se resolvió
inventando; todos son **parámetros configurables** con un valor por defecto documentado.

| # | Ambigüedad | Decisión por defecto | Dónde se cambia |
|---|---|---|---|
| 1 | **Pasos 9 y 10.** El Excel manda usar el "Saldo no deducible al 31-dic" del año, pero en el año de salida el pasivo final es 0, por lo que ese saldo también sería 0 y la fórmula quedaría siempre en cero. | Se usa el saldo acumulado **al año anterior**. | Parámetros → `base_saldos_salida` |
| 2 | **Pasos 26 y 27.** El Excel (D65/D66) **suma** la reversión del AID; el enunciado del proyecto la **resta**. | La reversión se almacena con signo negativo y se suma (numéricamente equivalente a restarla). | Parámetros → `signo_reversion_aid` |
| 3 | **Paso 13.** No dice de qué saldo del año base proviene el pool a compensar. El paso 29 sí lo aclara para el ingreso gravado adicional. | **Saldo deducible al 31-12 del año base.** | Parámetros → `origen_saldo_anio_base` |
| 4 | **Paso 4.** No se explicita la fórmula del pasivo final; solo se listan los campos. | Si el archivo trae el pasivo final se usa ese valor y la fórmula (`inicial + CL + IF + CSP + ORI + traspasos − pagos − salidas anticipadas`) queda como control: la diferencia se reporta como alerta. Los signos son configurables. | Parámetros → `pasivo_final_desde_archivo` y `signos_pasivo_final` |
| 5 | **Fondeo (reglas JP-04/JP-05, año 2021).** El Excel no indica de dónde sale el dato. | Parámetro por año, marcado como **supuesto** (genera alerta informativa). Si el archivo actuarial trae columna de fondeo por empleado, esa prevalece. | Parámetros → Fondeo por año |
| 6 | **Paso 21.** "Se define la tarifa de IR esperada": no da ningún valor. | **Ninguna tarifa por defecto.** Los años sin tarifa generan alerta crítica y su impuesto diferido queda en 0. | Parámetros → Tarifa de IR por año |
| 7 | **Paso 8.** Clasificación ERI/ORI de la salida anticipada. | Sin evidencia contable el estado queda en **REVISIÓN MANUAL** y no se calcula ingreso gravado ni no gravado. | Carga de información contable, o ajuste manual en Resultados → Salidas anticipadas |
| 8 | **Paso 6, celda D29.** Registro contable de las pérdidas y ganancias actuariales (ERI u ORI). | Parámetro por año, vacío por defecto. | Parámetros → Registro de P&G actuariales |
| 9 | **Paso 11.** "Siempre que el valor pagado haya generado un impuesto diferido". | Se exige base imponible del AID acumulada > 0 y se limita al monto efectivamente pagado. | `05-engine.js` (documentado en la traza) |
| 10 | **Paso 2.** No define cómo derivar el status si el archivo no lo trae. | Si el archivo lo trae, manda. Si no: INGRESO cuando no existe en el año anterior, ACTIVO cuando continúa. Nunca se deriva SALIDA ni JUBILADO. El origen se muestra en la traza. | — |
| 11 | **Paso 26, "primer año".** El Excel indica usar solo el producto del período. | Se implementa literalmente. Es numéricamente idéntico a la fórmula general, porque en el primer año no hay saldo previo ni reversiones posibles. | — |
| 12 | **Regímenes.** El Excel usa una pestaña por régimen y año. | Se admite una columna `Régimen` o cargar cada archivo indicando el régimen en el diálogo de mapeo. | Diálogo de mapeo de columnas |

> Las reglas incluidas representan la **lógica inicial del proyecto**. Deben contrastarse con la
> normativa tributaria ecuatoriana vigente antes de utilizar el programa para una declaración o
> determinación tributaria real.

---

## 6. Alertas

Clasificadas en **CRÍTICA**, **ADVERTENCIA** e **INFORMATIVA**:

`REGISTRO_DUPLICADO` · `DUPLICADO_POSIBLE` · `NOMBRE_NO_HOMOLOGADO` · `EMPLEADO_DESAPARECE` ·
`EMPLEADO_REAPARECE` · `CRUCE_INCONSISTENTE` · `DIF_ACTUARIAL` · `PASIVO_NEGATIVO` ·
`SALIDA_PASIVO_NO_CERO` · `SALIDA_SIN_PAGO` · `ORI_SIN_CLASIFICACION` · `INFO_INCOMPLETA` ·
`DIF_CONCILIACION` · `INCONSISTENCIA_ENTRE_ANIOS` · `REGLA_SIN_CONFIGURAR` ·
`REGLA_PENDIENTE_CONSULTA` · `TARIFA_IR_INEXISTENTE` · `SUPUESTO_APLICADO`

### Homologación de empleados

El programa **nunca fusiona por su cuenta**. Une automáticamente solo lo que coincide de forma
exacta tras normalizar (mayúsculas, tildes, espacios dobles, caracteres especiales). Todo lo demás
—mismas palabras en distinto orden, similitud textual alta— se **propone** y requiere confirmación.
El nombre original siempre se conserva.

---

## 7. Conciliaciones

- **Contra los resúmenes actuariales:** por año, régimen y concepto, muestra valor actuarial,
  valor calculado, diferencia y estado OK / REVISAR.
- **Entre años:** pasivo final del año *t* contra pasivo inicial de *t+1*. La diferencia se
  descompone en **bajas** (empleados que no continúan), **altas** (empleados nuevos con saldo
  inicial) y **residual**. El estado se decide sobre el residual, que es lo que realmente debe
  cuadrar.

---

## 8. Trazabilidad

Cada campo calculado se puede rastrear hasta su origen. La pantalla *Detalle del cálculo* muestra,
para el empleado, año y régimen seleccionados, **31 bloques** con:

- Campo y paso del Excel del que proviene
- Fórmula aplicada
- Valores utilizados, uno por uno
- Resultado
- Regla tributaria aplicada y su estado
- Archivo de origen, hoja y número de fila

La traza también se exporta: por registro individual (botón *Exportar esta traza*) o completa en la
pestaña 17 del Anexo.

---

## 9. Pruebas

*Pruebas → Ejecutar pruebas*. **20 casos**, todos en verde:

empleado nuevo · empleado activo · empleado jubilado · empleado que sale · TS menor a 10 años ·
TS mayor o igual a 10 años · salida anticipada con reverso contra ERI · salida anticipada sin
evidencia contable · ORI positivo · ORI negativo compensado · ORI negativo que agota el saldo ·
pago con impuesto diferido y reversión del AID · diferencia actuarial · duplicidad de empleado ·
cambio de escritura del nombre · empleado que desaparece · reglas distintas JP vs. BD en el mismo
año · tarifa de IR no configurada · año fuera del alcance de las reglas · salida con pasivo
distinto de cero.

Cada caso compara **resultado esperado vs. resultado calculado**, verificación por verificación.

---

## 10. Exportación

17 pestañas: Base empleados · Resumen unificado · JP · BD · Deducibilidad · Movimiento deducible ·
Salidas anticipadas · Ingresos gravados · Ingresos no gravados · ORI negativo · Impuesto diferido ·
Reversiones · Ingreso gravado adicional · Conciliaciones · Alertas · Parámetros · Auditoría.

Las filas de totales se escriben como fórmulas `=SUMA()` **con su valor calculado precargado**: el
archivo se abre mostrando los números y a la vez conserva la fórmula viva.

---

## 11. Seguridad y confidencialidad

- Todo el procesamiento ocurre en el equipo, dentro del navegador.
- **No se realiza ninguna llamada de red.** El programa funciona sin conexión a internet.
- Los archivos cargados viven solo en memoria y desaparecen al cerrar la pestaña.
- Lo único persistente son los parámetros y reglas tributarias (sin datos de empleados), en el
  almacenamiento local del navegador.
- *Datos y seguridad* permite eliminar los archivos cargados o borrar todo.
- Para respaldar el proyecto guarde, junto al expediente del cliente: el archivo del programa, los
  parámetros en JSON y el Anexo exportado. Con esos tres elementos el análisis es reproducible.

---

## 12. Advertencia profesional

Esta herramienta automatiza un procedimiento de trabajo; **no sustituye el criterio profesional**.
Antes de usar sus resultados para una declaración o determinación tributaria:

1. Contraste las reglas cargadas contra la normativa tributaria ecuatoriana vigente.
2. Resuelva todas las alertas críticas.
3. Verifique las reglas marcadas como *Consulta vinculante* (JP y BD 2022–2023).
4. Confirme el parámetro de fondeo de JP 2021, que por defecto es un supuesto.
5. Revise las conciliaciones contra los resúmenes actuariales.
