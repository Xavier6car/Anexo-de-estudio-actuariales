/* =============================================================================
 * MODULO: VALIDACIONES Y ALERTAS
 * -----------------------------------------------------------------------------
 * Consolida las incidencias detectadas por el motor de calculo y agrega las
 * validaciones transversales (catalogo de empleados, reglas, tarifas).
 * Cada alerta se clasifica en CRITICA / ADVERTENCIA / INFORMATIVA.
 * ========================================================================== */
var APP = window.APP;

APP.Validaciones = (function () {

  var CATALOGO = {
    REGISTRO_DUPLICADO:        { titulo: 'Registro duplicado', severidad: 'CRITICA' },
    DUPLICADO_POSIBLE:         { titulo: 'Posible empleado duplicado', severidad: 'ADVERTENCIA' },
    NOMBRE_NO_HOMOLOGADO:      { titulo: 'Nombre con variaciones entre anios', severidad: 'INFORMATIVA' },
    EMPLEADO_DESAPARECE:       { titulo: 'Empleado desaparece sin registrar salida', severidad: 'ADVERTENCIA' },
    EMPLEADO_REAPARECE:        { titulo: 'Empleado reaparece tras ausentarse', severidad: 'ADVERTENCIA' },
    CRUCE_INCONSISTENTE:       { titulo: 'Cruce con el anio anterior inconsistente', severidad: 'ADVERTENCIA' },
    DIF_ACTUARIAL:             { titulo: 'Diferencia contra el informe actuarial', severidad: 'CRITICA' },
    PASIVO_NEGATIVO:           { titulo: 'Pasivo neto negativo', severidad: 'CRITICA' },
    SALIDA_PASIVO_NO_CERO:     { titulo: 'Salida con pasivo distinto de cero', severidad: 'CRITICA' },
    SALIDA_SIN_PAGO:           { titulo: 'Salida sin pago registrado', severidad: 'ADVERTENCIA' },
    ORI_SIN_CLASIFICACION:     { titulo: 'Salida anticipada sin clasificacion ERI/ORI', severidad: 'CRITICA' },
    INFO_INCOMPLETA:           { titulo: 'Informacion incompleta', severidad: 'ADVERTENCIA' },
    DIF_CONCILIACION:          { titulo: 'Diferencia de conciliacion', severidad: 'CRITICA' },
    INCONSISTENCIA_ENTRE_ANIOS:{ titulo: 'Datos inconsistentes entre anios', severidad: 'CRITICA' },
    REGLA_SIN_CONFIGURAR:      { titulo: 'Regla tributaria sin configurar', severidad: 'CRITICA' },
    REGLA_PENDIENTE_CONSULTA:  { titulo: 'Regla sujeta a consulta vinculante', severidad: 'INFORMATIVA' },
    TARIFA_IR_INEXISTENTE:     { titulo: 'Tarifa de Impuesto a la Renta inexistente', severidad: 'CRITICA' },
    SUPUESTO_APLICADO:         { titulo: 'Supuesto aplicado por defecto', severidad: 'INFORMATIVA' }
  };

  var ORDEN = { CRITICA: 0, ADVERTENCIA: 1, INFORMATIVA: 2 };

  /**
   * Construye la lista final de alertas.
   * @param {object} resultado  salida de APP.Motor.ejecutar
   * @param {object} cfg
   * @param {Array}  conciliaciones  salida de APP.Conciliacion.calcular
   */
  function construir(resultado, cfg, conciliaciones) {
    var alertas = [];
    var empPorId = {};
    (resultado.empleados || []).forEach(function (e) { empPorId[e.empleado_id] = e; });

    function nombreDe(id) {
      var e = empPorId[id];
      return e ? (e.nombre_canonico || e.nombre_norm) : (id || '');
    }

    function push(tipo, sev, texto, ctx) {
      var meta = CATALOGO[tipo] || { titulo: tipo, severidad: 'ADVERTENCIA' };
      alertas.push({
        tipo: tipo,
        titulo: meta.titulo,
        severidad: sev || meta.severidad,
        anio: ctx && ctx.anio !== undefined ? ctx.anio : '',
        regimen: ctx && ctx.regimen ? ctx.regimen : '',
        empleado_id: ctx && ctx.empleado_id ? ctx.empleado_id : '',
        empleado: ctx && ctx.empleado_id ? nombreDe(ctx.empleado_id) : '',
        detalle: texto,
        fuente: ctx && ctx.fuente
          ? [ctx.fuente.archivo, ctx.fuente.hoja, ctx.fuente.fila ? 'fila ' + ctx.fuente.fila : '']
              .filter(Boolean).join(' / ')
          : ''
      });
    }

    /* --- 1. Incidencias del motor de calculo ---------------------------- */
    (resultado.incidencias || []).forEach(function (i) {
      push(i.tipo, i.severidad, i.detalle, i);
    });

    /* --- 2. Posibles duplicados de empleados (prompt seccion 26) -------- */
    (resultado.duplicados || []).forEach(function (d) {
      push('DUPLICADO_POSIBLE', d.similitud >= 0.99 ? 'ADVERTENCIA' : 'ADVERTENCIA',
        d.motivo + ': "' + d.a.nombre_canonico + '" (' + d.a.empleado_id + ') y "' +
        d.b.nombre_canonico + '" (' + d.b.empleado_id + '). Revise en Homologacion y confirme si son la misma persona.',
        { empleado_id: d.a.empleado_id });
    });

    /* --- 3. Nombres con variaciones ya homologadas ---------------------- */
    (resultado.variaciones || []).forEach(function (e) {
      push('NOMBRE_NO_HOMOLOGADO', 'INFORMATIVA',
        'El empleado se presenta con ' + e.nombres_originales.length + ' escrituras distintas: ' +
        e.nombres_originales.map(function (x) { return '"' + x + '"'; }).join(', ') +
        '. Se unificaron bajo ' + e.empleado_id + '.',
        { empleado_id: e.empleado_id });
    });

    /* --- 4. Cobertura del motor de reglas ------------------------------- */
    APP.Reglas.validarConjunto(cfg, resultado.anios).forEach(function (p) {
      push('REGLA_SIN_CONFIGURAR', 'CRITICA', p.detalle, { regimen: p.regimen });
    });

    /* --- 5. Tarifas de IR faltantes en anios con analisis de ID --------- */
    (resultado.anios || []).forEach(function (a) {
      if (a < cfg.anclas.anio_inicio_id) return;
      var t = cfg.tarifas_ir ? cfg.tarifas_ir[a] : undefined;
      if (t === undefined || t === null || t === '') {
        push('TARIFA_IR_INEXISTENTE', 'CRITICA',
          'No hay tarifa de Impuesto a la Renta configurada para ' + a +
          '. Definala en Parametros antes de utilizar los resultados de impuesto diferido.', { anio: a });
      }
    });

    /* --- 6. Diferencias de conciliacion --------------------------------- */
    (conciliaciones || []).forEach(function (c) {
      if (c.estado === 'REVISAR') {
        push('DIF_CONCILIACION', 'CRITICA',
          c.regimen + ' ' + c.anio + ' - ' + c.concepto + ': actuarial ' + c.valor_actuarial.toFixed(2) +
          ' vs. calculado ' + c.valor_calculado.toFixed(2) + '. Diferencia ' + c.diferencia.toFixed(2) + '.' +
          (c.residual !== undefined
            ? ' Residual tras descontar altas y bajas del periodo: ' + c.residual.toFixed(2) + '.' : ''),
          { anio: c.anio, regimen: c.regimen });
      }
    });

    /* --- 7. Deduplicacion y orden --------------------------------------- */
    var vistos = {};
    var unicas = alertas.filter(function (a) {
      var k = [a.tipo, a.anio, a.regimen, a.empleado_id, a.detalle].join('~');
      if (vistos[k]) return false;
      vistos[k] = true; return true;
    });

    unicas.sort(function (a, b) {
      var d = ORDEN[a.severidad] - ORDEN[b.severidad];
      if (d) return d;
      if (a.anio !== b.anio) return (a.anio || 0) - (b.anio || 0);
      return String(a.empleado).localeCompare(String(b.empleado));
    });

    return unicas;
  }

  function resumen(alertas) {
    var r = { CRITICA: 0, ADVERTENCIA: 0, INFORMATIVA: 0, total: alertas.length, porTipo: {} };
    alertas.forEach(function (a) {
      r[a.severidad] = (r[a.severidad] || 0) + 1;
      r.porTipo[a.tipo] = (r.porTipo[a.tipo] || 0) + 1;
    });
    return r;
  }

  return { CATALOGO: CATALOGO, construir: construir, resumen: resumen };
})();
