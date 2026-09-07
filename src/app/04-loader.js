/* =============================================================================
 * MODULO: CARGA DE ARCHIVOS
 * -----------------------------------------------------------------------------
 * Lee Excel (.xlsx/.xlsm/.xls) y CSV/TXT enteramente en memoria del navegador.
 * NINGUN dato se envia a la red: la lectura la hace SheetJS empotrado en este
 * mismo archivo y el resultado vive solo mientras la pestania este abierta.
 *
 * Detecta la fila de encabezados, propone un mapeo automatico de columnas y
 * permite al usuario corregirlo antes de construir los registros.
 * ========================================================================== */
var APP = window.APP;

APP.Loader = (function () {

  /* ---------------------------------------------------------------------- *
   * Diccionario de alias de encabezados. Se compara sobre el texto
   * normalizado (mayusculas, sin tildes, sin signos).
   * ---------------------------------------------------------------------- */
  var ALIAS = {
    anio:                    ['ANIO', 'ANO', 'AÑO', 'YEAR', 'PERIODO', 'EJERCICIO'],
    regimen:                 ['REGIMEN', 'RUBRO', 'CONCEPTO GENERAL', 'BENEFICIO', 'TIPO', 'JP BD', 'PROVISION'],
    nombre:                  ['NOMBRE', 'NOMBRES', 'EMPLEADO', 'COLABORADOR', 'APELLIDOS Y NOMBRES',
                              'NOMBRE DEL EMPLEADO', 'NOMBRE COMPLETO', 'TRABAJADOR', 'BENEFICIARIO'],
    cedula:                  ['CEDULA', 'IDENTIFICACION', 'CI', 'DOCUMENTO', 'NUMERO DE CEDULA'],
    sexo:                    ['SEXO', 'GENERO'],
    edad:                    ['EDAD', 'EDAD ACTUAL', 'EDAD ANIOS'],
    ts:                      ['TS', 'TIEMPO DE SERVICIO', 'TIEMPO SERVICIO', 'ANTIGUEDAD', 'ANIOS DE SERVICIO',
                              'ANOS DE SERVICIO', 'TIEMPO DE SERVICIOS', 'TS ANIOS', 'TS ANOS'],
    status:                  ['STATUS', 'ESTADO', 'STATUS LABORAL', 'ESTATUS', 'SITUACION'],
    pasivo_inicial:          ['PASIVO NETO DEL ANIO ANTERIOR', 'PASIVO NETO DEL ANO ANTERIOR',
                              'PASIVO NETO ANIO ANTERIOR', 'PASIVO NETO ANO ANTERIOR',
                              'PASIVO DEL ANO ANTERIOR', 'PASIVO INICIAL', 'SALDO INICIAL',
                              'PASIVO NETO INICIAL', 'SALDO AL INICIO',
                              'RESERVA INICIAL', 'PROVISION INICIAL'],
    costo_laboral:           ['COSTO LABORAL', 'COSTO DEL SERVICIO', 'COSTO SERVICIO', 'COSTO LABORAL DEL PERIODO',
                              'SERVICE COST'],
    interes_financiero:      ['INTERES FINANCIERO', 'COSTO FINANCIERO', 'INTERES', 'INTERESES',
                              'INTEREST COST', 'COSTO POR INTERESES'],
    incremento:              ['INCREMENTO', 'INCREMENTO DEL PERIODO', 'GASTO DEL PERIODO'],
    costo_servicios_pasados: ['COSTO POR SERVICIOS PASADOS', 'SERVICIOS PASADOS', 'COSTO SERVICIOS PASADOS',
                              'CSP', 'PAST SERVICE COST'],
    ori:                     ['ORI', 'ORI DEL PERIODO', 'PERDIDAS Y GANANCIAS ACTUARIALES',
                              'GANANCIA PERDIDA ACTUARIAL', 'RESULTADO INTEGRAL', 'OTRO RESULTADO INTEGRAL',
                              'P G ACTUARIAL', 'REMEDICIONES'],
    salidas_anticipadas:     ['SALIDAS ANTICIPADAS', 'SALIDA ANTICIPADA', 'SALIDAS', 'BAJAS',
                              'LIQUIDACIONES', 'SALIDAS ANTICIPADAS DEL PERIODO'],
    traspasos:               ['TRASPASOS', 'VALORES DE TRASPASOS', 'TRANSFERENCIAS', 'TRASLADOS'],
    pagos:                   ['PAGOS', 'PAGOS DEL PERIODO', 'BENEFICIOS PAGADOS', 'PAGOS EFECTUADOS',
                              'PAGO CON CARGO A LA PROVISION'],
    pasivo_final:            ['PASIVO NETO', 'PASIVO FINAL', 'SALDO FINAL', 'PASIVO NETO FINAL',
                              'PASIVO NETO DEL ANIO', 'RESERVA FINAL', 'PROVISION FINAL', 'SALDO AL 31 DE DICIEMBRE'],
    fondeo:                  ['FONDEO', 'FONDEADO', 'FONDO', 'TIENE FONDEO'],
    salida_eri:              ['SALIDA ERI', 'SALIDAS ANTICIPADAS ERI', 'SALIDA ANTICIPADA ERI',
                              'REGISTRO ERI', 'ERI SALIDA', 'AFECTO ERI'],
    salida_ori:              ['SALIDA ORI', 'SALIDAS ANTICIPADAS ORI', 'SALIDA ANTICIPADA ORI',
                              'REGISTRO ORI', 'ORI SALIDA', 'AFECTO ORI'],
    clasificacion_pg:        ['CLASIFICACION PG', 'REGISTRO CONTABLE', 'TRATAMIENTO CONTABLE',
                              'CLASIFICACION CONTABLE', 'ERI U ORI', 'REGISTRO PG ACTUARIAL'],
    concepto:                ['CONCEPTO', 'DESCRIPCION', 'RUBRO', 'DETALLE', 'CAMPO'],
    valor:                   ['VALOR', 'TOTAL', 'IMPORTE', 'MONTO', 'SALDO'],
    observacion:             ['OBSERVACION', 'OBSERVACIONES', 'NOTA', 'COMENTARIO', 'SUSTENTO', 'REFERENCIA']
  };

  /* ---------------------------------------------------------------------- *
   * Utilidades de parseo
   * ---------------------------------------------------------------------- */

  function normTexto(v) {
    if (v === null || v === undefined) return '';
    return String(v).normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toUpperCase().replace(/[^A-Z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  }

  /**
   * Convierte a numero tolerando formatos es-EC y en-US, parentesis para
   * negativos, simbolos de moneda, guiones y espacios.
   * Devuelve null si la celda esta vacia; NaN nunca se propaga.
   */
  function num(v) {
    if (v === null || v === undefined || v === '') return null;
    if (typeof v === 'number') return isFinite(v) ? v : null;
    var s = String(v).trim();
    if (!s || s === '-' || s === '--') return null;
    var neg = false;
    if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
    if (/^-/.test(s)) { neg = true; s = s.slice(1); }
    s = s.replace(/[^0-9.,]/g, '');
    if (!s) return null;
    var ultimaComa = s.lastIndexOf(','), ultimoPunto = s.lastIndexOf('.');
    if (ultimaComa > -1 && ultimoPunto > -1) {
      if (ultimaComa > ultimoPunto) s = s.replace(/\./g, '').replace(',', '.'); // 1.234,56
      else s = s.replace(/,/g, '');                                            // 1,234.56
    } else if (ultimaComa > -1) {
      // una sola coma: decimal si deja 1 o 2 digitos a la derecha
      s = (s.length - ultimaComa - 1) <= 2 ? s.replace(',', '.') : s.replace(/,/g, '');
    } else if (ultimoPunto > -1) {
      var decimales = s.length - ultimoPunto - 1;
      if (decimales === 3 && s.split('.').length > 2) s = s.replace(/\./g, ''); // 1.234.567
    }
    var n = parseFloat(s);
    if (!isFinite(n)) return null;
    return neg ? -n : n;
  }

  /** Extrae un anio de 4 digitos de casi cualquier celda. */
  function anioDe(v) {
    if (v === null || v === undefined || v === '') return null;
    if (v instanceof Date) return v.getFullYear();
    if (typeof v === 'number' && v >= 1900 && v <= 2100) return Math.round(v);
    var m = String(v).match(/(19|20)\d{2}/);
    return m ? parseInt(m[0], 10) : null;
  }

  /** Normaliza el status laboral a uno de los cuatro valores del Excel (paso 2). */
  function statusDe(v) {
    var t = normTexto(v);
    if (!t) return null;
    if (/JUBIL/.test(t)) return 'JUBILADO';
    if (/CESANT|SALID|EGRES|RETIR|LIQUID|BAJA|DESVINCUL/.test(t)) return 'SALIDA';
    if (/INGRES|NUEVO|ALTA/.test(t)) return 'INGRESO';
    if (/ACTIV|VIGENT|CONTINU|PERMANEC/.test(t)) return 'ACTIVO';
    return null; // no se asume nada
  }

  /** Normaliza el regimen a JP o BD. */
  function regimenDe(v) {
    var t = normTexto(v);
    if (!t) return null;
    if (/DESAHUCIO|^BD$|BONIFICACION/.test(t)) return 'BD';
    if (/JUBILACION|^JP$|PATRONAL/.test(t)) return 'JP';
    return null;
  }

  /** Interpreta SI/NO, TRUE/FALSE, 1/0, X. */
  function boolDe(v) {
    if (v === null || v === undefined || v === '') return null;
    if (typeof v === 'boolean') return v;
    var t = normTexto(v);
    if (!t) return null;
    if (/^(SI|S|YES|Y|TRUE|VERDADERO|X|1|CON FONDEO|FONDEADO)$/.test(t)) return true;
    if (/^(NO|N|FALSE|FALSO|0|SIN FONDEO|NO FONDEADO)$/.test(t)) return false;
    return null;
  }

  /* ---------------------------------------------------------------------- *
   * Lectura de archivos
   * ---------------------------------------------------------------------- */

  /**
   * Lee un File y devuelve { nombre, hojas: [{ nombre, aoa }] }.
   * aoa = array de arrays (matriz de celdas crudas).
   */
  function leerArchivo(file) {
    return new Promise(function (resolve, reject) {
      var fr = new FileReader();
      fr.onerror = function () { reject(new Error('No se pudo leer el archivo ' + file.name)); };
      fr.onload = function (ev) {
        try {
          var wb = XLSX.read(ev.target.result, {
            type: 'array', cellDates: true, cellNF: false, cellText: false, raw: false
          });
          var hojas = wb.SheetNames.map(function (nm) {
            return {
              nombre: nm,
              aoa: XLSX.utils.sheet_to_json(wb.Sheets[nm], { header: 1, defval: null, blankrows: false, raw: true })
            };
          });
          resolve({ nombre: file.name, tamano: file.size, hojas: hojas });
        } catch (e) { reject(e); }
      };
      fr.readAsArrayBuffer(file);
    });
  }

  /* ---------------------------------------------------------------------- *
   * Deteccion de encabezados y mapeo de columnas
   * ---------------------------------------------------------------------- */

  /** Puntua una fila segun cuantas de sus celdas parecen encabezados conocidos. */
  function puntuarFila(fila) {
    if (!fila) return 0;
    var p = 0;
    for (var i = 0; i < fila.length; i++) {
      var t = normTexto(fila[i]);
      if (!t || t.length < 2) continue;
      if (typeof fila[i] === 'number') continue;
      for (var campo in ALIAS) {
        if (ALIAS[campo].some(function (al) { return t === normTexto(al) || t.indexOf(normTexto(al)) === 0; })) {
          p += 2; break;
        }
      }
      p += 0.1; // texto en general
    }
    return p;
  }

  /** Busca la fila de encabezados en las primeras 25 filas. */
  function detectarEncabezado(aoa) {
    var mejor = 0, mejorP = -1;
    var lim = Math.min(aoa.length, 25);
    for (var i = 0; i < lim; i++) {
      var p = puntuarFila(aoa[i]);
      if (p > mejorP) { mejorP = p; mejor = i; }
    }
    return mejor;
  }

  /** Mapeo automatico columna -> campo canonico. Devuelve { campo: indiceColumna }. */
  function mapearAuto(headers) {
    var mapa = {}, usadas = {};
    var normH = headers.map(normTexto);

    // 1) coincidencia exacta
    Object.keys(ALIAS).forEach(function (campo) {
      if (mapa[campo] !== undefined) return;
      for (var i = 0; i < normH.length; i++) {
        if (usadas[i] || !normH[i]) continue;
        if (ALIAS[campo].some(function (al) { return normH[i] === normTexto(al); })) {
          mapa[campo] = i; usadas[i] = true; return;
        }
      }
    });
    // 2) coincidencia por prefijo
    Object.keys(ALIAS).forEach(function (campo) {
      if (mapa[campo] !== undefined) return;
      for (var i = 0; i < normH.length; i++) {
        if (usadas[i] || !normH[i]) continue;
        if (ALIAS[campo].some(function (al) {
          var a = normTexto(al);
          return a.length >= 3 && normH[i].indexOf(a) === 0;
        })) { mapa[campo] = i; usadas[i] = true; return; }
      }
    });
    // 3) contencion: para cada columna libre se elige el campo cuyo alias MAS LARGO
    //    aparezca dentro del encabezado. Asi "TS (Tiempo de servicio)" cae en ts y
    //    no en cualquier campo que solo comparta una palabra.
    for (var j = 0; j < normH.length; j++) {
      if (usadas[j] || !normH[j]) continue;
      var palabras = normH[j].split(' ');
      var mejorCampo = null, mejorLargo = 0;
      Object.keys(ALIAS).forEach(function (campo) {
        if (mapa[campo] !== undefined) return;
        ALIAS[campo].forEach(function (al) {
          var a = normTexto(al);
          if (!a) return;
          var coincide = a.length >= 4 ? normH[j].indexOf(a) >= 0 : palabras.indexOf(a) >= 0;
          if (coincide && a.length > mejorLargo) { mejorLargo = a.length; mejorCampo = campo; }
        });
      });
      if (mejorCampo) { mapa[mejorCampo] = j; usadas[j] = true; }
    }
    return mapa;
  }

  /** Lista de campos canonicos disponibles, para el selector manual de la UI. */
  function camposDisponibles() { return Object.keys(ALIAS); }

  /* ---------------------------------------------------------------------- *
   * Construccion de registros
   * ---------------------------------------------------------------------- */

  /**
   * Convierte la matriz en registros crudos de informacion actuarial.
   * @param opciones { anioFijo, regimenFijo, archivo, hoja }
   */
  function construirRegistrosActuariales(aoa, filaEnc, mapa, opciones) {
    opciones = opciones || {};
    var out = [];
    function celda(fila, campo) {
      var i = mapa[campo];
      return (i === undefined || i === null) ? null : fila[i];
    }
    for (var f = filaEnc + 1; f < aoa.length; f++) {
      var fila = aoa[f];
      if (!fila) continue;
      var nombre = celda(fila, 'nombre');
      if (nombre === null || nombre === undefined || String(nombre).trim() === '') continue;
      var nt = normTexto(nombre);
      if (!nt) continue;
      // descarta filas de totales / subtotales
      if (/^(TOTAL|TOTALES|SUBTOTAL|SUMA|GRAN TOTAL)\b/.test(nt)) continue;

      var anio = anioDe(celda(fila, 'anio'));
      if (anio === null) anio = opciones.anioFijo || null;
      var reg = regimenDe(celda(fila, 'regimen'));
      if (!reg) reg = opciones.regimenFijo || null;

      out.push({
        _origen: {
          archivo: opciones.archivo || '', hoja: opciones.hoja || '',
          fila: f + 1 // 1-based como en Excel
        },
        anio: anio,
        regimen: reg,
        nombre_original: String(nombre).trim(),
        cedula: celda(fila, 'cedula') !== null ? String(celda(fila, 'cedula')).trim() : '',
        sexo: celda(fila, 'sexo') !== null ? String(celda(fila, 'sexo')).trim() : '',
        edad: num(celda(fila, 'edad')),
        ts: num(celda(fila, 'ts')),
        status_archivo: statusDe(celda(fila, 'status')),
        pasivo_inicial: num(celda(fila, 'pasivo_inicial')),
        costo_laboral: num(celda(fila, 'costo_laboral')),
        interes_financiero: num(celda(fila, 'interes_financiero')),
        incremento_archivo: num(celda(fila, 'incremento')),
        costo_servicios_pasados: num(celda(fila, 'costo_servicios_pasados')),
        ori: num(celda(fila, 'ori')),
        salidas_anticipadas: num(celda(fila, 'salidas_anticipadas')),
        traspasos: num(celda(fila, 'traspasos')),
        pagos: num(celda(fila, 'pagos')),
        pasivo_final_archivo: num(celda(fila, 'pasivo_final')),
        fondeo_archivo: boolDe(celda(fila, 'fondeo')),
        salida_eri_archivo: num(celda(fila, 'salida_eri')),
        salida_ori_archivo: num(celda(fila, 'salida_ori')),
        clasificacion_pg_archivo: (function () {
          var t = normTexto(celda(fila, 'clasificacion_pg'));
          if (/^ERI/.test(t)) return 'ERI';
          if (/^ORI/.test(t)) return 'ORI';
          return null;
        })()
      });
    }
    return out;
  }

  /**
   * Registros de un resumen actuarial (formato largo: concepto / valor).
   * Se usan para la conciliacion del paso 4 (celda D13).
   */
  function construirRegistrosResumen(aoa, filaEnc, mapa, opciones) {
    opciones = opciones || {};
    var out = [];
    function celda(fila, campo) {
      var i = mapa[campo];
      return (i === undefined || i === null) ? null : fila[i];
    }
    for (var f = filaEnc + 1; f < aoa.length; f++) {
      var fila = aoa[f];
      if (!fila) continue;
      var concepto = celda(fila, 'concepto');
      if (concepto === null && mapa.concepto === undefined) concepto = fila[0];
      if (concepto === null || String(concepto).trim() === '') continue;
      var valor = num(celda(fila, 'valor'));
      if (valor === null) {
        // formato ancho: busca la primera celda numerica de la fila
        for (var c = 0; c < fila.length; c++) {
          if (c === mapa.concepto) continue;
          var v = num(fila[c]);
          if (v !== null) { valor = v; break; }
        }
      }
      if (valor === null) continue;
      out.push({
        _origen: { archivo: opciones.archivo || '', hoja: opciones.hoja || '', fila: f + 1 },
        anio: anioDe(celda(fila, 'anio')) || opciones.anioFijo || null,
        regimen: regimenDe(celda(fila, 'regimen')) || opciones.regimenFijo || null,
        concepto: String(concepto).trim(),
        concepto_norm: normTexto(concepto),
        valor: valor
      });
    }
    return out;
  }

  /**
   * Registros de informacion contable: sustento de la clasificacion ERI/ORI
   * de las salidas anticipadas (Excel paso 8, celda D34).
   */
  function construirRegistrosContables(aoa, filaEnc, mapa, opciones) {
    opciones = opciones || {};
    var out = [];
    function celda(fila, campo) {
      var i = mapa[campo];
      return (i === undefined || i === null) ? null : fila[i];
    }
    for (var f = filaEnc + 1; f < aoa.length; f++) {
      var fila = aoa[f];
      if (!fila) continue;
      var nombre = celda(fila, 'nombre');
      if (nombre === null || String(nombre).trim() === '') continue;
      var nt = normTexto(nombre);
      if (!nt || /^(TOTAL|TOTALES|SUBTOTAL|SUMA)\b/.test(nt)) continue;
      out.push({
        _origen: { archivo: opciones.archivo || '', hoja: opciones.hoja || '', fila: f + 1 },
        anio: anioDe(celda(fila, 'anio')) || opciones.anioFijo || null,
        regimen: regimenDe(celda(fila, 'regimen')) || opciones.regimenFijo || null,
        nombre_original: String(nombre).trim(),
        salida_eri: num(celda(fila, 'salida_eri')),
        salida_ori: num(celda(fila, 'salida_ori')),
        clasificacion_pg: (function () {
          var t = normTexto(celda(fila, 'clasificacion_pg'));
          if (/^ERI/.test(t)) return 'ERI';
          if (/^ORI/.test(t)) return 'ORI';
          return null;
        })(),
        observacion: celda(fila, 'observacion') !== null ? String(celda(fila, 'observacion')).trim() : ''
      });
    }
    return out;
  }

  return {
    ALIAS: ALIAS,
    normTexto: normTexto,
    num: num,
    anioDe: anioDe,
    statusDe: statusDe,
    regimenDe: regimenDe,
    boolDe: boolDe,
    leerArchivo: leerArchivo,
    detectarEncabezado: detectarEncabezado,
    mapearAuto: mapearAuto,
    camposDisponibles: camposDisponibles,
    construirRegistrosActuariales: construirRegistrosActuariales,
    construirRegistrosResumen: construirRegistrosResumen,
    construirRegistrosContables: construirRegistrosContables
  };
})();
