/* =============================================================================
 * MODULO: CONFIGURACION
 * Anexo de Jubilacion Patronal (JP) y Bonificacion por Desahucio (BD)
 * -----------------------------------------------------------------------------
 * Todos los parametros y reglas tributarias viven en DATOS, no en codigo.
 * Se editan desde la pantalla "Parametros", se exportan/importan como JSON y
 * persisten en localStorage. Actualizar una regla NO requiere recompilar la app.
 *
 * Trazabilidad: cada regla referencia el paso y la celda del Excel fuente
 * "Proceso de Elaboracion de Anexo de JP y BD (confidencial).xlsx" (hoja Resumen).
 * ========================================================================== */
var APP = window.APP || {};
window.APP = APP;

APP.VERSION = '1.0.0';
APP.CONFIG_KEY = 'anexo_jpbd_config_v1';

/* --- Estados de una regla tributaria ------------------------------------- */
APP.ESTADO_REGLA = {
  CONFIRMADA: 'CONFIRMADA',                   // definida explicitamente en el Excel fuente
  PENDIENTE_CONSULTA: 'PENDIENTE_CONSULTA',   // sujeta a consulta vinculante con el SRI
  PENDIENTE_DEFINIR: 'PENDIENTE_DEFINIR'      // el usuario debe completarla
};

APP.STATUS = ['ACTIVO', 'INGRESO', 'SALIDA', 'JUBILADO'];
APP.STATUS_VIGENTE = ['ACTIVO', 'INGRESO', 'JUBILADO']; // Excel pasos 41, 42, 47, 48, 70

/* --- Reglas tributarias por defecto: JUBILACION PATRONAL ------------------
 * Origen: Excel paso 5 (celdas C16-C19) y paso 20 (celdas C51-C54).
 * El orden importa: se aplica la PRIMERA regla que coincide.
 * ts_min es inclusivo (TS >= ts_min); ts_max es exclusivo (TS < ts_max).
 * fondeo: true / false / null (null = la regla aplica con o sin fondeo).
 * ------------------------------------------------------------------------ */
APP.REGLAS_JP_DEFAULT = [
  { id: 'JP-01', regimen: 'JP', desde: null, hasta: 2017, ts_min: 10, ts_max: null, fondeo: null,
    deducible: true, impuesto_diferido: false, estado: 'CONFIRMADA',
    nota: 'Hasta 2017: TS mayor o igual a 10 anios, gasto deducible. No se considera ID.',
    fuente: 'Excel C16 / C51' },
  { id: 'JP-02', regimen: 'JP', desde: null, hasta: 2017, ts_min: null, ts_max: 10, fondeo: null,
    deducible: false, impuesto_diferido: false, estado: 'CONFIRMADA',
    nota: 'Hasta 2017: TS menor a 10 anios, gasto no deducible. No se considera ID.',
    fuente: 'Excel C16 / C51' },
  { id: 'JP-03', regimen: 'JP', desde: 2018, hasta: 2020, ts_min: null, ts_max: null, fondeo: null,
    deducible: false, impuesto_diferido: true, estado: 'CONFIRMADA',
    nota: '2018 a 2020: gasto no deducible. Si se considera ID.',
    fuente: 'Excel C17 / C52' },
  { id: 'JP-04', regimen: 'JP', desde: 2021, hasta: 2021, ts_min: 10, ts_max: null, fondeo: true,
    deducible: true, impuesto_diferido: false, estado: 'CONFIRMADA',
    nota: '2021: TS mayor o igual a 10 con fondeo, gasto deducible. No se considera ID.',
    fuente: 'Excel C18 / C53' },
  { id: 'JP-05', regimen: 'JP', desde: 2021, hasta: 2021, ts_min: 10, ts_max: null, fondeo: false,
    deducible: false, impuesto_diferido: true, estado: 'CONFIRMADA',
    nota: '2021: TS mayor o igual a 10 sin fondeo, gasto no deducible. Si se considera ID.',
    fuente: 'Excel C18 / C53' },
  { id: 'JP-06', regimen: 'JP', desde: 2021, hasta: 2021, ts_min: null, ts_max: 10, fondeo: null,
    deducible: false, impuesto_diferido: false, estado: 'CONFIRMADA',
    nota: '2021: TS menor a 10 anios, gasto no deducible. No se considera ID.',
    fuente: 'Excel C18 / C53' },
  { id: 'JP-07', regimen: 'JP', desde: 2022, hasta: 2023, ts_min: null, ts_max: null, fondeo: null,
    deducible: false, impuesto_diferido: true, estado: 'PENDIENTE_CONSULTA',
    nota: '2022 a 2023: gasto no deducible, ID previa consulta vinculante con el SRI.',
    fuente: 'Excel C19 / C54' }
];

/* --- Reglas tributarias por defecto: BONIFICACION POR DESAHUCIO -----------
 * Origen: Excel paso 5 (celdas C21-C24) y paso 20 (celdas C56-C59).
 * ------------------------------------------------------------------------ */
APP.REGLAS_BD_DEFAULT = [
  { id: 'BD-01', regimen: 'BD', desde: null, hasta: 2010, ts_min: null, ts_max: null, fondeo: null,
    deducible: false, impuesto_diferido: false, estado: 'CONFIRMADA',
    nota: 'Hasta 2010: gasto no deducible. No se considera ID.',
    fuente: 'Excel C21 / C56' },
  { id: 'BD-02', regimen: 'BD', desde: 2011, hasta: 2017, ts_min: null, ts_max: null, fondeo: null,
    deducible: true, impuesto_diferido: false, estado: 'CONFIRMADA',
    nota: '2011 a 2017: gasto deducible. No se considera ID.',
    fuente: 'Excel C21 / C56' },
  { id: 'BD-03', regimen: 'BD', desde: 2018, hasta: 2020, ts_min: null, ts_max: null, fondeo: null,
    deducible: false, impuesto_diferido: true, estado: 'CONFIRMADA',
    nota: '2018 a 2020: gasto no deducible. Si se considera ID.',
    fuente: 'Excel C22 / C57' },
  { id: 'BD-04', regimen: 'BD', desde: 2021, hasta: 2021, ts_min: null, ts_max: null, fondeo: null,
    deducible: true, impuesto_diferido: false, estado: 'CONFIRMADA',
    nota: '2021: gasto deducible. No se considera ID.',
    fuente: 'Excel C23 / C58' },
  { id: 'BD-05', regimen: 'BD', desde: 2022, hasta: 2023, ts_min: null, ts_max: null, fondeo: null,
    deducible: false, impuesto_diferido: true, estado: 'PENDIENTE_CONSULTA',
    nota: '2022 a 2023: gasto no deducible, ID previa consulta vinculante con el SRI.',
    fuente: 'Excel C24 / C59' }
];

/* --- Configuracion por defecto ------------------------------------------- */
APP.configDefault = function () {
  return {
    meta: { version: APP.VERSION, creado: new Date().toISOString(), compania: '', ejercicio: '' },

    /* Rango de anios a analizar. Se ajusta automaticamente al cargar archivos. */
    anios: { inicio: null, fin: null },

    /* Anios ancla del analisis (Excel D38, D41, D47, D69) */
    anclas: {
      anio_base: 2017,                 // saldo inicial de ID / ORI negativo / IGA = 31-12-2017
      anio_inicio_id: 2018,            // el analisis de impuestos diferidos inicia en 2018
      anio_inicio_reversos_pago: 2019  // uso del ID por pagos, desde 2019 (RLRTI)
    },

    /* Tarifa de Impuesto a la Renta por anio.
       Vacio = NO configurada -> alerta CRITICA. El Excel (paso 21) solo indica
       "se define la tarifa esperada": el programa no asume ninguna tarifa. */
    tarifas_ir: {},

    /* Fondeo del fondo de JP por anio. Solo incide en JP 2021 (reglas JP-04 / JP-05).
       Si el archivo actuarial trae una columna de fondeo por empleado, esa prevalece. */
    fondeo: { 2021: false },
    fondeo_es_supuesto: true,

    /* Clasificacion contable de las perdidas y ganancias actuariales por anio:
       'ERI' | 'ORI' | null (no determinada -> revision manual). Excel D29. */
    clasificacion_pg_actuarial: {},

    /* Interpretaciones parametrizables. Ver README, seccion "Reglas ambiguas". */
    opciones: {
      // Pasos 9 y 10: en el anio de salida el pasivo final es 0, por lo que el saldo
      // no deducible de ese anio tambien seria 0. Se usa el saldo acumulado al anio anterior.
      base_saldos_salida: 'ANIO_ANTERIOR',        // 'ANIO_ANTERIOR' | 'ANIO_CORRIENTE'

      // Pasos 26 y 27: el Excel SUMA la reversion (D65/D66); el prompt la RESTA.
      // Con 'NEGATIVO' la reversion se almacena con signo negativo y se suma (equivalente).
      signo_reversion_aid: 'NEGATIVO',            // 'NEGATIVO' (suma) | 'POSITIVO' (resta)

      // Paso 13: de que saldo del anio base proviene el pool a compensar.
      origen_saldo_anio_base: 'SALDO_DEDUCIBLE',  // 'SALDO_DEDUCIBLE' | 'SALDO_NO_DEDUCIBLE' | 'MANUAL'

      // Paso 4: si el archivo trae el pasivo final se usa ese valor y la formula
      // queda como control (se reporta la diferencia como alerta).
      pasivo_final_desde_archivo: true,

      // Signos de la formula de control del pasivo final.
      signos_pasivo_final: {
        pasivo_inicial: 1, costo_laboral: 1, interes_financiero: 1,
        costo_servicios_pasados: 1, ori: 1, traspasos: 1,
        pagos: -1, salidas_anticipadas: -1
      },

      // Tolerancias y presentacion
      tolerancia_conciliacion: 1.00,
      tolerancia_cero: 0.005,
      umbral_similitud_nombres: 0.90,
      decimales: 2
    },

    reglas_jp: JSON.parse(JSON.stringify(APP.REGLAS_JP_DEFAULT)),
    reglas_bd: JSON.parse(JSON.stringify(APP.REGLAS_BD_DEFAULT))
  };
};

/* --- Persistencia local (la informacion nunca sale del equipo) ----------- */
APP.cargarConfig = function () {
  var base = APP.configDefault();
  try {
    var raw = localStorage.getItem(APP.CONFIG_KEY);
    if (raw) {
      var g = JSON.parse(raw);
      base.meta     = Object.assign(base.meta, g.meta || {});
      base.anios    = Object.assign(base.anios, g.anios || {});
      base.anclas   = Object.assign(base.anclas, g.anclas || {});
      base.opciones = Object.assign(base.opciones, g.opciones || {});
      base.opciones.signos_pasivo_final = Object.assign(
        APP.configDefault().opciones.signos_pasivo_final,
        (g.opciones && g.opciones.signos_pasivo_final) || {});
      base.tarifas_ir = g.tarifas_ir || {};
      base.fondeo = g.fondeo || base.fondeo;
      if (typeof g.fondeo_es_supuesto === 'boolean') base.fondeo_es_supuesto = g.fondeo_es_supuesto;
      base.clasificacion_pg_actuarial = g.clasificacion_pg_actuarial || {};
      if (Array.isArray(g.reglas_jp) && g.reglas_jp.length) base.reglas_jp = g.reglas_jp;
      if (Array.isArray(g.reglas_bd) && g.reglas_bd.length) base.reglas_bd = g.reglas_bd;
    }
  } catch (e) { console.warn('No se pudo leer la configuracion guardada:', e); }
  return base;
};

APP.guardarConfig = function (cfg) {
  try { localStorage.setItem(APP.CONFIG_KEY, JSON.stringify(cfg)); return true; }
  catch (e) { console.warn('No se pudo guardar la configuracion:', e); return false; }
};

APP.borrarConfig = function () {
  try { localStorage.removeItem(APP.CONFIG_KEY); } catch (e) {}
};
