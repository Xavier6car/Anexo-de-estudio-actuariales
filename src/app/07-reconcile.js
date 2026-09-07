/* =============================================================================
 * MODULO: CONCILIACIONES
 * -----------------------------------------------------------------------------
 * Excel paso 4, celda D13: "Se recomienda realizar una conciliacion entre los
 * valores totales de cada campo vs los valores consignados en los Resumenes
 * Actuariales".
 *
 * Compara, por anio y regimen, el total calculado del resumen unificado contra
 * el total declarado en el resumen actuarial cargado por el usuario.
 * ========================================================================== */
var APP = window.APP;

APP.Conciliacion = (function () {

  /* Conceptos conciliables y los patrones con los que se los reconoce en el
     resumen actuarial. El texto del resumen se compara normalizado. */
  var CONCEPTOS = [
    { campo: 'pasivo_inicial',          etiqueta: 'Pasivo neto inicial',
      patrones: ['PASIVO NETO DEL ANIO ANTERIOR', 'PASIVO INICIAL', 'SALDO INICIAL', 'PASIVO NETO INICIAL'] },
    { campo: 'costo_laboral',           etiqueta: 'Costo laboral',
      patrones: ['COSTO LABORAL', 'COSTO DEL SERVICIO', 'COSTO SERVICIO'] },
    { campo: 'interes_financiero',      etiqueta: 'Interes financiero',
      patrones: ['INTERES FINANCIERO', 'COSTO FINANCIERO', 'INTERES'] },
    { campo: 'incremento',              etiqueta: 'Incremento',
      patrones: ['INCREMENTO'] },
    { campo: 'costo_servicios_pasados', etiqueta: 'Costo por servicios pasados',
      patrones: ['COSTO POR SERVICIOS PASADOS', 'SERVICIOS PASADOS', 'CSP'] },
    { campo: 'ori',                     etiqueta: 'ORI',
      patrones: ['ORI', 'PERDIDAS Y GANANCIAS ACTUARIALES', 'REMEDICIONES', 'RESULTADO INTEGRAL'] },
    { campo: 'traspasos',               etiqueta: 'Valores de traspasos',
      patrones: ['TRASPASOS', 'TRANSFERENCIAS'] },
    { campo: 'pagos',                   etiqueta: 'Pagos',
      patrones: ['PAGOS', 'BENEFICIOS PAGADOS'] },
    { campo: 'salidas_anticipadas',     etiqueta: 'Salidas anticipadas',
      patrones: ['SALIDAS ANTICIPADAS', 'SALIDA ANTICIPADA', 'BAJAS'] },
    { campo: 'pasivo_final',            etiqueta: 'Pasivo neto final',
      patrones: ['PASIVO NETO', 'PASIVO FINAL', 'SALDO FINAL', 'SALDO AL 31 DE DICIEMBRE'] }
  ];

  function norm(s) { return APP.Loader.normTexto(s); }

  /** Encuentra el concepto canonico al que corresponde una linea del resumen. */
  function reconocer(conceptoNorm) {
    var mejor = null, mejorLargo = -1;
    CONCEPTOS.forEach(function (c) {
      c.patrones.forEach(function (p) {
        var pn = norm(p);
        if (conceptoNorm === pn || conceptoNorm.indexOf(pn) === 0) {
          if (pn.length > mejorLargo) { mejor = c; mejorLargo = pn.length; }
        }
      });
    });
    return mejor;
  }

  /**
   * @param {object} resultado    salida del motor
   * @param {Array}  resumenes    registros de resumenes actuariales cargados
   * @param {object} cfg
   * @returns {Array} filas de conciliacion
   */
  function calcular(resultado, resumenes, cfg) {
    var tol = cfg.opciones.tolerancia_conciliacion;
    var out = [];

    /* Totales calculados por anio / regimen / campo */
    var tot = {};
    (resultado.filas || []).forEach(function (f) {
      var k = f.regimen + '|' + f.anio;
      if (!tot[k]) { tot[k] = { _n: 0 }; }
      tot[k]._n++;
      CONCEPTOS.forEach(function (c) {
        var v = f[c.campo];
        if (v === null || v === undefined || isNaN(v)) return;
        tot[k][c.campo] = (tot[k][c.campo] || 0) + Number(v);
      });
    });

    /* Comparacion contra los resumenes actuariales cargados */
    var declarados = {};
    (resumenes || []).forEach(function (r) {
      if (r.anio === null || !r.regimen) return;
      var c = reconocer(r.concepto_norm);
      if (!c) return;
      var k = r.regimen + '|' + r.anio + '|' + c.campo;
      if (declarados[k] === undefined) {
        declarados[k] = { valor: r.valor, concepto: c, origen: r._origen, texto: r.concepto };
      } else {
        declarados[k].valor += r.valor;   // el resumen puede venir desglosado
      }
    });

    Object.keys(declarados).forEach(function (k) {
      var partes = k.split('|');
      var reg = partes[0], anio = Number(partes[1]), campo = partes[2];
      var d = declarados[k];
      var calc = (tot[reg + '|' + anio] && tot[reg + '|' + anio][campo]) || 0;
      var dif = d.valor - calc;
      out.push({
        anio: anio, regimen: reg,
        concepto: d.concepto.etiqueta,
        campo: campo,
        valor_actuarial: d.valor,
        valor_calculado: calc,
        diferencia: dif,
        estado: Math.abs(dif) <= tol ? 'OK' : 'REVISAR',
        fuente: d.origen ? [d.origen.archivo, d.origen.hoja, 'fila ' + d.origen.fila].filter(Boolean).join(' / ') : '',
        texto_original: d.texto
      });
    });

    /* Conciliacion interna: pasivo final del anio t vs pasivo inicial del anio t+1.
       Las altas (empleados que aparecen en t+1 con saldo inicial) y las bajas
       (empleados que estaban en t y no continuan) explican parte de la diferencia:
       se cuantifican por separado y el estado se decide sobre el residual. */
    var presencia = {};
    (resultado.filas || []).forEach(function (f) {
      presencia[f.regimen + '|' + f.anio + '|' + f.empleado_id] = f;
    });

    Object.keys(tot).forEach(function (k) {
      var partes = k.split('|');
      var reg = partes[0], anio = Number(partes[1]);
      var sig = tot[reg + '|' + (anio + 1)];
      if (!sig) return;
      var final = tot[k].pasivo_final || 0;
      var inicialSig = sig.pasivo_inicial || 0;
      var dif = final - inicialSig;

      var altas = 0, bajas = 0, nAltas = 0, nBajas = 0;
      (resultado.filas || []).forEach(function (f) {
        if (f.regimen !== reg) return;
        if (f.anio === anio + 1 && !presencia[reg + '|' + anio + '|' + f.empleado_id]) {
          altas += Number(f.pasivo_inicial) || 0; nAltas++;
        }
        if (f.anio === anio && !presencia[reg + '|' + (anio + 1) + '|' + f.empleado_id]) {
          bajas += Number(f.pasivo_final) || 0; nBajas++;
        }
      });
      var residual = dif - bajas + altas;

      var explicacion = 'Calculo interno';
      if (nBajas || nAltas) {
        explicacion += ' · ' + nBajas + ' baja(s) por ' + bajas.toFixed(2) +
          ' y ' + nAltas + ' alta(s) con saldo inicial ' + altas.toFixed(2) +
          ' · residual ' + residual.toFixed(2);
      }

      out.push({
        anio: anio, regimen: reg,
        concepto: 'Enlace ' + anio + ' -> ' + (anio + 1) + ' (pasivo final vs. pasivo inicial)',
        campo: 'enlace_anios',
        valor_actuarial: final,
        valor_calculado: inicialSig,
        diferencia: dif,
        residual: residual,
        altas: altas, bajas: bajas,
        estado: Math.abs(residual) <= tol ? 'OK' : 'REVISAR',
        fuente: explicacion,
        texto_original: ''
      });
    });

    out.sort(function (a, b) {
      if (a.regimen !== b.regimen) return a.regimen < b.regimen ? -1 : 1;
      if (a.anio !== b.anio) return a.anio - b.anio;
      return a.concepto.localeCompare(b.concepto);
    });
    return out;
  }

  return { CONCEPTOS: CONCEPTOS, calcular: calcular, reconocer: reconocer };
})();
