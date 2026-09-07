/* =============================================================================
 * MODULO: INTERFAZ - RESULTADOS, ALERTAS, TRAZABILIDAD, PRUEBAS Y EXPORTACION
 * ========================================================================== */
var APP = window.APP;

(function () {
  var U = APP.UI, S = APP.S;
  var esc = U.esc, fmt = U.fmt, fmt0 = U.fmt0, pct = U.pct, tabla = U.tabla, suma = U.suma;

  /* ====================================================================== *
   * PANTALLA: RESULTADOS
   * ====================================================================== */
  var SUBS = [
    ['unificado', 'Resumen unificado'],
    ['empleados', 'Base de empleados'],
    ['deducibilidad', 'Deducibilidad'],
    ['movimiento', 'Movimiento deducible'],
    ['salidas', 'Salidas anticipadas'],
    ['ingresos', 'Ingresos gravados / no gravados'],
    ['orineg', 'ORI negativo'],
    ['diferido', 'Impuesto diferido'],
    ['reversiones', 'Reversiones y deduccion adicional'],
    ['iga', 'Ingreso gravado adicional'],
    ['conciliaciones', 'Conciliaciones']
  ];

  function vistaResultados() {
    if (!S.resultado) {
      return '<div class="vacio"><div class="ic">☰</div><div class="t">Todavia no hay resultados</div>' +
        '<div class="s">Ejecute el analisis para ver el Anexo calculado.</div>' +
        '<button class="btn pri" style="margin-top:14px" data-ir="proceso">Ir a Procesamiento</button></div>';
    }
    if (!S.sub) S.sub = 'unificado';
    var h = '<div class="subtabs">';
    SUBS.forEach(function (s) {
      h += '<button data-accion="sub" data-s="' + s[0] + '" class="' + (S.sub === s[0] ? 'on' : '') + '">' +
        esc(s[1]) + '</button>';
    });
    h += '</div>';
    h += (SUB_VISTAS[S.sub] || function () { return ''; })();
    return h;
  }

  function trazaBtn() { return ''; }

  /** Columnas comunes de identificacion. */
  function colsId() {
    return [
      { k: 'anio', h: 'Anio', t: 'int' },
      { k: 'regimen', h: 'Reg.', t: 'tag', tag: function (v) { return v === 'JP' ? 'brand' : 'info'; } },
      { k: 'nombre_original', h: 'Empleado' },
      { k: 'empleado_id', h: 'ID' }
    ];
  }

  var SUB_VISTAS = {

    /* --- Resumen unificado (paso 4) ----------------------------------- */
    unificado: function () {
      var f = U.filas();
      var h = U.barraFiltros() +
        '<div class="tarjeta"><header><h2>Resumen unificado por empleado y anio</h2>' +
        '<div class="der"><span class="nota mini">Paso 4 · haga clic en una fila para ver el detalle del calculo</span>' +
        '</div></header>';
      h += tabla(colsId().concat([
        { k: 'status', h: 'Status', t: 'tag', tag: U.tagStatus },
        { k: 'cruce', h: 'Cruce', t: 'tag', tag: U.tagEstado },
        { k: 'ts', h: 'TS', t: 'num' },
        { k: function (r) { return r.deducible === null ? 'NO DETERMINADO' : (r.deducible ? 'DEDUCIBLE' : 'NO DEDUCIBLE'); },
          h: 'Deducible', t: 'tag', tag: function (v) { return v === 'DEDUCIBLE' ? 'ok' : v === 'NO DETERMINADO' ? 'crit' : 'warn'; } },
        { k: 'pasivo_inicial', h: 'Pasivo inicial', t: 'num' },
        { k: 'costo_laboral', h: 'Costo laboral', t: 'num' },
        { k: 'interes_financiero', h: 'Interes fin.', t: 'num' },
        { k: 'costo_servicios_pasados', h: 'Serv. pasados', t: 'num' },
        { k: 'ori', h: 'ORI', t: 'num' },
        { k: 'traspasos', h: 'Traspasos', t: 'num' },
        { k: 'pagos', h: 'Pagos', t: 'num' },
        { k: 'salidas_anticipadas', h: 'Salidas ant.', t: 'num' },
        { k: 'salida_eri', h: 'Salida ERI', t: 'num' },
        { k: 'salida_ori', h: 'Salida ORI', t: 'num' },
        { k: 'pasivo_final', h: 'Pasivo final', t: 'num' }
      ]), f, {
        totales: ['pasivo_inicial', 'costo_laboral', 'interes_financiero', 'costo_servicios_pasados',
                  'ori', 'traspasos', 'pagos', 'salidas_anticipadas', 'salida_eri', 'salida_ori', 'pasivo_final'],
        onFila: 'ver-traza', clave: function (r) { return r.empleado_id + '|' + r.regimen + '|' + r.anio; }
      });
      h += '</div>';
      return h;
    },

    /* --- Base de empleados -------------------------------------------- */
    empleados: function () {
      var R = S.resultado;
      var lista = R.empleados.filter(function (e) {
        if (!S.filtro.texto) return true;
        return (e.nombre_norm + ' ' + e.nombres_originales.join(' ')).toUpperCase()
          .indexOf(S.filtro.texto.toUpperCase()) >= 0;
      });
      return U.barraFiltros() + '<div class="tarjeta"><header><h2>Base de empleados</h2></header>' +
        tabla([
          { k: 'empleado_id', h: 'ID' },
          { k: 'nombre_canonico', h: 'Nombre original' },
          { k: 'nombre_norm', h: 'Nombre normalizado' },
          { k: function (e) { return e.nombres_originales.join(' | '); }, h: 'Escrituras' },
          { k: 'sexo', h: 'Sexo' },
          { k: function (e) { return e.anios.join(', '); }, h: 'Anios' },
          { k: function (e) { return e.regimenes.join(', '); }, h: 'Regimenes' }
        ], lista, { maxFilas: 2000 }) + '</div>';
    },

    /* --- Deducibilidad (paso 5) --------------------------------------- */
    deducibilidad: function () {
      var f = U.filas();
      var h = U.barraFiltros() + '<div class="tarjeta"><header><h2>Tratamiento tributario aplicado</h2>' +
        '<div class="der"><span class="nota mini">Paso 5 · regla, estado y fuente de cada decision</span></div></header>';
      h += tabla(colsId().concat([
        { k: 'ts', h: 'TS', t: 'num' },
        { k: function (r) { return r.ts_mayor_10 === null ? '' : (r.ts_mayor_10 ? 'SI' : 'NO'); }, h: 'TS >= 10', t: 'tag', tag: U.tagEstado },
        { k: function (r) { return r.fondeo === null ? '' : (r.fondeo ? 'CON FONDEO' : 'SIN FONDEO'); }, h: 'Fondeo' },
        { k: 'regla_id', h: 'Regla', t: 'tag', tag: function () { return 'brand'; } },
        { k: 'regla_estado', h: 'Estado regla', t: 'tag',
          tag: function (v) { return v === 'CONFIRMADA' ? 'ok' : v === 'PENDIENTE_CONSULTA' ? 'warn' : 'crit'; } },
        { k: 'tratamiento', h: 'Tratamiento' },
        { k: 'regla_nota', h: 'Base' },
        { k: 'regla_fuente', h: 'Fuente' }
      ]), f, { onFila: 'ver-traza', clave: function (r) { return r.empleado_id + '|' + r.regimen + '|' + r.anio; } });
      h += '</div>';
      return h;
    },

    /* --- Movimiento de valores deducibles (paso 6) -------------------- */
    movimiento: function () {
      var f = U.filas();
      var h = U.barraFiltros() + '<div class="tarjeta"><header><h2>Movimiento de valores deducibles</h2>' +
        '<div class="der"><span class="nota mini">Paso 6 · ERI, ORI, saldo deducible y no deducible al 31 de diciembre</span>' +
        '</div></header>';
      h += tabla(colsId().concat([
        { k: function (r) { return r.deducible === null ? 'ND' : (r.deducible ? 'SI' : 'NO'); }, h: 'Deducible', t: 'tag', tag: U.tagEstado },
        { k: 'mov_eri', h: 'ERI', t: 'num' },
        { k: 'mov_ori', h: 'ORI', t: 'num' },
        { k: 'saldo_deducible_anterior', h: 'Saldo ded. anterior', t: 'num' },
        { k: 'saldo_deducible', h: 'Saldo deducible 31-dic', t: 'num' },
        { k: 'pasivo_final', h: 'Pasivo final', t: 'num' },
        { k: 'saldo_no_deducible', h: 'Saldo no deducible 31-dic', t: 'num' }
      ]), f, {
        totales: ['mov_eri', 'mov_ori', 'saldo_deducible', 'pasivo_final', 'saldo_no_deducible'],
        onFila: 'ver-traza', clave: function (r) { return r.empleado_id + '|' + r.regimen + '|' + r.anio; }
      });
      h += '</div>';
      return h;
    },

    /* --- Salidas anticipadas (pasos 7, 8, 11 y 12) -------------------- */
    salidas: function () {
      var f = U.filas().filter(function (r) { return r.status === 'SALIDA' || r.salida_anticipada === 'SI'; });
      var pend = f.filter(function (r) { return r.clasificacion_estado === 'REVISION MANUAL'; });
      var h = U.barraFiltros();
      if (pend.length) {
        h += '<div class="aviso crit"><b>' + fmt0(pend.length) + ' salidas anticipadas sin clasificar</b>' +
          'El programa no asume si la reversion afecto ERI u ORI. Cargue el mayor contable o el informe de ' +
          'auditoria en Carga de informacion, o registre la clasificacion manualmente con el boton de cada fila.</div>';
      }
      h += '<div class="tarjeta"><header><h2>Salidas y salidas anticipadas</h2>' +
        '<div class="der"><span class="nota mini">Pasos 7, 8, 11 y 12</span></div></header>';
      h += tabla(colsId().concat([
        { k: 'status', h: 'Status', t: 'tag', tag: U.tagStatus },
        { k: 'pasivo_final', h: 'Pasivo final', t: 'num' },
        { k: 'salidas_anticipadas', h: 'Salidas ant.', t: 'num' },
        { k: 'salida_anticipada', h: 'Salida anticipada', t: 'tag', tag: U.tagEstado },
        { k: 'salida_eri', h: 'Afecta ERI', t: 'num' },
        { k: 'salida_ori', h: 'Afecta ORI', t: 'num' },
        { k: 'clasificacion_estado', h: 'Estado', t: 'tag', tag: U.tagEstado },
        { k: 'clasificacion_fuente', h: 'Fuente' },
        { k: 'pagos', h: 'Pagos', t: 'num' },
        { k: 'pago_con_cargo_provision', h: 'Pago c/ provision', t: 'tag', tag: U.tagEstado },
        { k: 'base_id_acumulada', h: 'Base AID acum.', t: 'num' },
        { k: 'deduccion_adicional', h: 'Deduccion adicional', t: 'num' }
      ]), f, {
        totales: ['salidas_anticipadas', 'salida_eri', 'salida_ori', 'pagos', 'deduccion_adicional'],
        onFila: 'clasificar', clave: function (r) { return r.empleado_id + '|' + r.regimen + '|' + r.anio; },
        vacio: 'No hay salidas registradas en los filtros seleccionados.'
      });
      h += '</div>';
      return h;
    },

    /* --- Ingresos gravados y no gravados (pasos 9 y 10) --------------- */
    ingresos: function () {
      var f = U.filas().filter(function (r) { return r.ingreso_gravado > 0 || r.ingreso_no_gravado > 0; });
      var h = U.barraFiltros();
      h += '<div class="rejilla c2" style="margin-bottom:16px">' +
        '<div class="kpi ok"><div class="et">Ingreso no gravado (reverso contra ERI)</div><div class="v">' +
        fmt(suma(U.filas(), 'ingreso_no_gravado')) + '</div><div class="d">Paso 9 · MIN(saldo no deducible; salida ERI)</div></div>' +
        '<div class="kpi warn"><div class="et">Ingreso gravado (reverso contra ORI)</div><div class="v">' +
        fmt(suma(U.filas(), 'ingreso_gravado')) + '</div><div class="d">Paso 10 · MIN(saldo deducible; salida ORI)</div></div></div>';
      h += '<div class="tarjeta"><header><h2>Ingresos gravados y no gravados por salidas anticipadas</h2></header>';
      h += tabla(colsId().concat([
        { k: 'salida_anticipada', h: 'Salida ant.', t: 'tag', tag: U.tagEstado },
        { k: 'base_ingreso_no_gravado', h: 'Saldo no deducible base', t: 'num' },
        { k: 'salida_eri', h: 'Salida ERI', t: 'num' },
        { k: 'ingreso_no_gravado', h: 'Ingreso NO gravado', t: 'num' },
        { k: 'base_ingreso_gravado', h: 'Saldo deducible base', t: 'num' },
        { k: 'salida_ori', h: 'Salida ORI', t: 'num' },
        { k: 'ingreso_gravado', h: 'Ingreso gravado', t: 'num' }
      ]), f, {
        totales: ['ingreso_no_gravado', 'ingreso_gravado'],
        onFila: 'ver-traza', clave: function (r) { return r.empleado_id + '|' + r.regimen + '|' + r.anio; },
        vacio: 'No se determinaron ingresos gravados ni no gravados con la informacion cargada.'
      });
      h += '</div>';
      return h;
    },

    /* --- ORI negativo (pasos 13 a 17) --------------------------------- */
    orineg: function () {
      var f = U.filas().filter(function (r) { return r.ori_negativo !== null && r.ori_negativo !== undefined; });
      var h = U.barraFiltros() + '<div class="tarjeta"><header><h2>Analisis de ORI negativo</h2>' +
        '<div class="der"><span class="nota mini">Pasos 13 a 17 · saldo inicial al 31-12-' +
        S.cfg.anclas.anio_base + '</span></div></header>';
      h += tabla(colsId().concat([
        { k: 'status', h: 'Status', t: 'tag', tag: U.tagStatus },
        { k: 'empleado_activo_iga', h: 'Vigente', t: 'tag', tag: U.tagEstado },
        { k: 'ori', h: 'ORI del periodo', t: 'num' },
        { k: 'ori_negativo', h: 'ORI negativo', t: 'num' },
        { k: 'por_compensar_anterior', h: 'Por compensar (anterior)', t: 'num' },
        { k: 'saldo_2017_compensado', h: 'Saldo compensado', t: 'num' },
        { k: 'saldo_2017_por_compensar', h: 'Saldo por compensar', t: 'num' },
        { k: 'considerar_en_diferido', h: 'Considerar en diferido', t: 'num' }
      ]), f, {
        totales: ['ori', 'ori_negativo', 'considerar_en_diferido'],
        onFila: 'ver-traza', clave: function (r) { return r.empleado_id + '|' + r.regimen + '|' + r.anio; }
      });
      h += '</div>';
      return h;
    },

    /* --- Impuesto diferido (pasos 18 a 28) ---------------------------- */
    diferido: function () {
      var f = U.filas().filter(function (r) { return r.eri_id !== null && r.eri_id !== undefined; });
      var sinTarifa = f.filter(function (r) { return r.tarifa_ir_estado === 'NO CONFIGURADA'; }).length;
      var h = U.barraFiltros();
      if (sinTarifa) {
        h += '<div class="aviso crit"><b>Faltan tarifas de Impuesto a la Renta</b>' +
          fmt0(sinTarifa) + ' registros no pudieron calcular el impuesto diferido. ' +
          'Configure la tarifa por anio en Parametros.</div>';
      }
      h += '<div class="tarjeta"><header><h2>Analisis de impuestos diferidos</h2>' +
        '<div class="der"><span class="nota mini">Pasos 18 a 28 · inicia en ' + S.cfg.anclas.anio_inicio_id +
        '</span></div></header>';
      h += tabla(colsId().concat([
        { k: 'status', h: 'Status', t: 'tag', tag: U.tagStatus },
        { k: 'incremento', h: 'Incremento', t: 'num' },
        { k: 'eri_id', h: 'ERI ID', t: 'num' },
        { k: 'ori_neto', h: 'ORI neto', t: 'num' },
        { k: 'total_dif_temporaria', h: 'Dif. temporaria', t: 'num' },
        { k: function (r) { return r.tarifa_ir === null ? 'SIN TARIFA' : pct(r.tarifa_ir); }, h: 'Tarifa IR' },
        { k: 'id_eri', h: 'ID ERI', t: 'num' },
        { k: 'id_ori', h: 'ID ORI', t: 'num' },
        { k: 'rev_aid_eri', h: 'Rev. AID ERI', t: 'num' },
        { k: 'rev_aid_ori', h: 'Rev. AID ORI', t: 'num' },
        { k: 'saldo_dif_eri', h: 'Saldo dif. ERI', t: 'num' },
        { k: 'saldo_dif_ori', h: 'Saldo dif. ORI', t: 'num' },
        { k: 'saldo_dif_activo', h: 'Saldo dif. activo', t: 'num' }
      ]), f, {
        totales: ['incremento', 'eri_id', 'ori_neto', 'total_dif_temporaria', 'id_eri', 'id_ori',
                  'rev_aid_eri', 'rev_aid_ori', 'saldo_dif_eri', 'saldo_dif_ori', 'saldo_dif_activo'],
        onFila: 'ver-traza', clave: function (r) { return r.empleado_id + '|' + r.regimen + '|' + r.anio; }
      });
      h += '</div>';
      return h;
    },

    /* --- Reversiones (pasos 24, 25, 11 y 12) -------------------------- */
    reversiones: function () {
      var f = U.filas().filter(function (r) {
        return (r.rev_aid_eri && r.rev_aid_eri !== 0) || (r.rev_aid_ori && r.rev_aid_ori !== 0) ||
               (r.deduccion_adicional && r.deduccion_adicional !== 0);
      });
      var h = U.barraFiltros() + '<div class="tarjeta"><header><h2>Reversiones del activo por impuesto diferido</h2>' +
        '<div class="der"><span class="nota mini">Pasos 24 y 25 (reversion por salida) · pasos 11 y 12 (uso por pago)</span>' +
        '</div></header>';
      h += tabla(colsId().concat([
        { k: 'status', h: 'Status', t: 'tag', tag: U.tagStatus },
        { k: 'rev_aid_eri', h: 'Reversion AID ERI', t: 'num' },
        { k: 'rev_aid_ori', h: 'Reversion AID ORI', t: 'num' },
        { k: 'rev_aid_detalle', h: 'Detalle' },
        { k: 'pagos', h: 'Pagos', t: 'num' },
        { k: 'base_id_acumulada', h: 'Base AID acumulada', t: 'num' },
        { k: 'deduccion_adicional', h: 'Deduccion adicional', t: 'num' },
        { k: 'deduccion_adicional_formula', h: 'Formula' }
      ]), f, {
        totales: ['rev_aid_eri', 'rev_aid_ori', 'pagos', 'deduccion_adicional'],
        onFila: 'ver-traza', clave: function (r) { return r.empleado_id + '|' + r.regimen + '|' + r.anio; },
        vacio: 'No hay reversiones ni deducciones adicionales en los filtros seleccionados.'
      });
      h += '</div>';
      return h;
    },

    /* --- Ingreso gravado adicional (pasos 29 a 32) -------------------- */
    iga: function () {
      var f = U.filas().filter(function (r) {
        return r.ingreso_gravado_adicional !== null && r.ingreso_gravado_adicional !== undefined;
      });
      var h = U.barraFiltros() +
        '<div class="kpi warn" style="margin-bottom:16px"><div class="et">Ingreso gravado adicional total</div>' +
        '<div class="v">' + fmt(suma(f, 'ingreso_gravado_adicional')) + '</div>' +
        '<div class="d">ORI del anio compensado con el saldo deducible al 31-12-' + S.cfg.anclas.anio_base + '</div></div>';
      h += '<div class="tarjeta"><header><h2>Analisis de ingreso gravado adicional</h2>' +
        '<div class="der"><span class="nota mini">Pasos 29 a 32</span></div></header>';
      h += tabla(colsId().concat([
        { k: 'status', h: 'Status', t: 'tag', tag: U.tagStatus },
        { k: 'empleado_activo_iga', h: 'Empleado activo', t: 'tag', tag: U.tagEstado },
        { k: 'ori', h: 'ORI del periodo', t: 'num' },
        { k: 'ori_negativo', h: 'ORI negativo', t: 'num' },
        { k: 'por_compensar_anterior', h: 'Saldo base por compensar (anterior)', t: 'num' },
        { k: 'saldo_2017_por_compensar', h: 'Saldo base por compensar', t: 'num' },
        { k: 'ingreso_gravado_adicional', h: 'Ingreso gravado adicional', t: 'num' }
      ]), f, {
        totales: ['ori_negativo', 'ingreso_gravado_adicional'],
        onFila: 'ver-traza', clave: function (r) { return r.empleado_id + '|' + r.regimen + '|' + r.anio; }
      });
      h += '</div>';
      return h;
    },

    /* --- Conciliaciones (paso 4, D13) --------------------------------- */
    conciliaciones: function () {
      var c = S.conciliaciones.filter(function (x) {
        if (S.filtro.anio && String(x.anio) !== String(S.filtro.anio)) return false;
        if (S.filtro.regimen && x.regimen !== S.filtro.regimen) return false;
        return true;
      });
      var mal = c.filter(function (x) { return x.estado === 'REVISAR'; }).length;
      var h = U.barraFiltros(false);
      if (!S.resumenes.length) {
        h += '<div class="aviso"><b>No se cargaron resumenes actuariales</b>' +
          'Solo se muestra la conciliacion interna entre anios (pasivo final vs. pasivo inicial del anio siguiente). ' +
          'Cargue los resumenes de JP y BD para conciliar contra los totales del actuario.</div>';
      } else if (mal) {
        h += '<div class="aviso crit"><b>' + fmt0(mal) + ' conceptos con diferencia</b>' +
          'Revise el mapeo de columnas y el alcance de los anios cargados.</div>';
      } else {
        h += '<div class="aviso ok"><b>Conciliacion sin diferencias</b>' +
          'Todos los conceptos comparados estan dentro de la tolerancia de ' +
          fmt(S.cfg.opciones.tolerancia_conciliacion) + '.</div>';
      }
      h += '<div class="tarjeta"><header><h2>Conciliacion contra los resumenes actuariales</h2></header>';
      h += tabla([
        { k: 'anio', h: 'Anio', t: 'int' },
        { k: 'regimen', h: 'Reg.', t: 'tag', tag: function (v) { return v === 'JP' ? 'brand' : 'info'; } },
        { k: 'concepto', h: 'Concepto' },
        { k: 'valor_actuarial', h: 'Valor actuarial', t: 'num' },
        { k: 'valor_calculado', h: 'Valor calculado', t: 'num' },
        { k: 'diferencia', h: 'Diferencia', t: 'num' },
        { k: 'residual', h: 'Residual', t: 'num' },
        { k: 'estado', h: 'Estado', t: 'tag', tag: U.tagEstado },
        { k: 'fuente', h: 'Fuente / explicacion' }
      ], c, { vacio: 'No hay conciliaciones que mostrar.' });
      h += '</div>';
      return h;
    }
  };

  /* ====================================================================== *
   * PANTALLA: ALERTAS
   * ====================================================================== */
  function vistaAlertas() {
    if (!S.resultado) {
      return '<div class="vacio"><div class="ic">!</div><div class="t">Sin analisis ejecutado</div>' +
        '<div class="s">Las alertas se generan al procesar la informacion.</div>' +
        '<button class="btn pri" style="margin-top:14px" data-ir="proceso">Ir a Procesamiento</button></div>';
    }
    var res = APP.Validaciones.resumen(S.alertas);
    var lista = S.alertas.filter(function (a) {
      if (S.filtro.severidad && a.severidad !== S.filtro.severidad) return false;
      if (S.filtro.anio && String(a.anio) !== String(S.filtro.anio)) return false;
      if (S.filtro.regimen && a.regimen && a.regimen !== S.filtro.regimen) return false;
      if (S.filtro.texto) {
        var t = S.filtro.texto.toUpperCase();
        if ((a.empleado + ' ' + a.detalle + ' ' + a.titulo).toUpperCase().indexOf(t) < 0) return false;
      }
      return true;
    });

    var h = '<div class="rejilla c3" style="margin-bottom:16px">' +
      '<div class="kpi crit"><div class="et">Criticas</div><div class="v">' + fmt0(res.CRITICA) + '</div>' +
      '<div class="d">impiden usar el resultado sin revision</div></div>' +
      '<div class="kpi warn"><div class="et">Advertencias</div><div class="v">' + fmt0(res.ADVERTENCIA) + '</div>' +
      '<div class="d">requieren verificacion</div></div>' +
      '<div class="kpi"><div class="et">Informativas</div><div class="v">' + fmt0(res.INFORMATIVA) + '</div>' +
      '<div class="d">supuestos y homologaciones aplicadas</div></div></div>';

    h += '<div class="fila" style="margin-bottom:12px">' +
      '<select data-filtro="severidad"><option value="">Todas las severidades</option>' +
      ['CRITICA', 'ADVERTENCIA', 'INFORMATIVA'].map(function (s) {
        return '<option value="' + s + '"' + (S.filtro.severidad === s ? ' selected' : '') + '>' + s + '</option>';
      }).join('') + '</select>';
    h += '<select data-filtro="anio"><option value="">Todos los anios</option>' +
      S.resultado.anios.map(function (a) {
        return '<option value="' + a + '"' + (String(S.filtro.anio) === String(a) ? ' selected' : '') + '>' + a + '</option>';
      }).join('') + '</select>';
    h += '<input type="text" data-filtro="texto" placeholder="Buscar en las alertas..." value="' +
      esc(S.filtro.texto) + '" style="min-width:260px">';
    h += '<span class="nota mini" style="margin-left:auto">' + fmt0(lista.length) + ' de ' + fmt0(S.alertas.length) + '</span>';
    h += '</div>';

    h += '<div class="tarjeta"><div class="cuerpo">';
    if (!lista.length) {
      h += '<div class="vacio"><div class="ic">✓</div><div class="t">Sin alertas</div>' +
        '<div class="s">No hay alertas para los filtros seleccionados.</div></div>';
    } else {
      lista.slice(0, 1200).forEach(function (a) {
        h += '<div class="alerta ' + a.severidad + '">' +
          '<span class="tag ' + U.tagSev(a.severidad) + '">' + a.severidad.substring(0, 4) + '</span>' +
          '<div class="cont"><div class="tt">' + esc(a.titulo) +
          (a.empleado ? ' · ' + esc(a.empleado) : '') + (a.anio ? ' · ' + a.anio : '') +
          (a.regimen ? ' · ' + a.regimen : '') + '</div>' +
          '<div class="dd">' + esc(a.detalle) + '</div>' +
          (a.fuente ? '<div class="mm">' + esc(a.fuente) + '</div>' : '') + '</div></div>';
      });
      if (lista.length > 1200) {
        h += '<p class="nota mini">Se muestran las primeras 1.200 alertas. Exporte a Excel para el listado completo.</p>';
      }
    }
    h += '</div></div>';
    return h;
  }

  /* ====================================================================== *
   * PANTALLA: DETALLE DEL CALCULO (trazabilidad)
   * ====================================================================== */
  function vistaTraza() {
    if (!S.resultado) {
      return '<div class="vacio"><div class="ic">⌕</div><div class="t">Sin analisis ejecutado</div>' +
        '<button class="btn pri" style="margin-top:14px" data-ir="proceso">Ir a Procesamiento</button></div>';
    }
    var h = '<div class="tarjeta"><header><h2>Seleccione un registro</h2></header><div class="cuerpo">' +
      U.barraFiltros() + '</div>';
    var f = U.filas();
    h += tabla(colsId().concat([
      { k: 'status', h: 'Status', t: 'tag', tag: U.tagStatus },
      { k: 'pasivo_final', h: 'Pasivo final', t: 'num' },
      { k: 'saldo_deducible', h: 'Saldo deducible', t: 'num' },
      { k: 'saldo_dif_activo', h: 'Saldo dif. activo', t: 'num' }
    ]), f, {
      maxFilas: 400, onFila: 'ver-traza',
      clave: function (r) { return r.empleado_id + '|' + r.regimen + '|' + r.anio; }
    });
    h += '</div>';

    if (S.traza) {
      var fila = S.resultado.filaPorClave[S.traza];
      if (fila) {
        h += '<div class="tarjeta"><header><h2>Detalle del calculo · ' + esc(fila.nombre_original) +
          ' · ' + fila.regimen + ' ' + fila.anio + '</h2>' +
          '<div class="der"><button class="btn mini" data-accion="traza-exportar">Exportar esta traza</button></div>' +
          '</header><div class="cuerpo">';
        h += '<div class="rejilla c2" style="margin-bottom:14px">' +
          '<div class="nota"><b>Empleado:</b> ' + esc(fila.nombre_original) + ' (' + fila.empleado_id + ')<br>' +
          '<b>Nombre normalizado:</b> ' + esc(fila.nombre_norm) + '<br>' +
          '<b>Anio:</b> ' + fila.anio + ' · <b>Regimen:</b> ' + fila.regimen + '</div>' +
          '<div class="nota"><b>Archivo de origen:</b> ' +
          esc(fila._origen ? fila._origen.archivo : 's/d') + '<br>' +
          '<b>Hoja:</b> ' + esc(fila._origen ? fila._origen.hoja : 's/d') + ' · <b>Fila:</b> ' +
          esc(fila._origen ? fila._origen.fila : 's/d') + '<br>' +
          '<b>Regla tributaria:</b> ' + esc(fila.regla_id || 'ninguna') + ' [' + esc(fila.regla_estado) + ']</div></div>';

        APP.Traza.describirFila(fila, S.cfg).forEach(function (t) {
          h += '<div class="traza" style="margin-bottom:10px"><dl>' +
            '<dt>Campo</dt><dd><b>' + esc(t.etiqueta) + '</b> <span class="tag info">' + esc(t.paso) + '</span></dd>' +
            '<dt>Formula</dt><dd><div class="formula">' + esc(t.formula) + '</div></dd>' +
            '<dt>Valores</dt><dd>' + Object.keys(t.valores).map(function (k) {
              return '<code class="k">' + esc(k) + ' = ' + esc(t.valores[k]) + '</code>';
            }).join(' ') + '</dd>' +
            '<dt>Resultado</dt><dd><span class="res">' + esc(t.resultado) + '</span></dd>' +
            '<dt>Fuente</dt><dd class="nota mini">' + esc(t.fuente) + '</dd>' +
            '</dl></div>';
        });
        h += '</div></div>';
      }
    } else {
      h += '<div class="aviso"><b>Elija una fila</b>Haga clic en cualquier registro de la tabla ' +
        '(o en las tablas de Resultados) para reconstruir su calculo completo: formula, valores utilizados, ' +
        'regla tributaria aplicada y archivo de origen.</div>';
    }
    return h;
  }

  /* ====================================================================== *
   * PANTALLA: PRUEBAS
   * ====================================================================== */
  function vistaPruebas() {
    var h = '<div class="tarjeta"><header><h2>Casos de prueba</h2>' +
      '<div class="der"><button class="btn pri" data-accion="correr-pruebas">Ejecutar pruebas</button></div></header>' +
      '<div class="cuerpo"><p class="nota">Se ejecutan sobre datos sinteticos, sin tocar la informacion cargada. ' +
      'Cada caso compara el resultado esperado contra el resultado calculado por el motor.</p></div></div>';

    if (S.pruebas) {
      var r = APP.Pruebas.resumen(S.pruebas);
      h += '<div class="rejilla c3" style="margin-bottom:16px">' +
        '<div class="kpi"><div class="et">Casos</div><div class="v">' + r.total + '</div></div>' +
        '<div class="kpi ok"><div class="et">Pasan</div><div class="v">' + r.pasan + '</div></div>' +
        '<div class="kpi ' + (r.fallan ? 'crit' : 'ok') + '"><div class="et">Fallan</div><div class="v">' +
        r.fallan + '</div></div></div>';

      S.pruebas.forEach(function (c, i) {
        h += '<div class="caso ' + c.estado + '" id="caso-' + i + '">' +
          '<header data-accion="toggle-caso" data-i="' + i + '">' +
          '<span class="tag ' + (c.estado === 'PASA' ? 'ok' : 'crit') + '">' + c.estado + '</span>' +
          '<span class="n">' + c.id + '. ' + esc(c.nombre) + '</span>' +
          '<span class="der nota mini">' + c.checks.filter(function (k) { return k.ok; }).length +
          '/' + c.checks.length + ' verificaciones</span></header>' +
          '<div class="det"><p class="nota" style="margin-bottom:10px">' + esc(c.descripcion) + '</p>' +
          '<table class="datos"><thead><tr><th>Concepto</th><th class="num">Esperado</th>' +
          '<th class="num">Calculado</th><th>Resultado</th></tr></thead><tbody>';
        c.checks.forEach(function (k) {
          h += '<tr><td>' + esc(k.concepto) + '</td>' +
            '<td class="num">' + esc(typeof k.esperado === 'number' ? fmt(k.esperado) : String(k.esperado)) + '</td>' +
            '<td class="num">' + esc(typeof k.obtenido === 'number' ? fmt(k.obtenido) : String(k.obtenido)) + '</td>' +
            '<td><span class="tag ' + (k.ok ? 'ok' : 'crit') + '">' + (k.ok ? 'OK' : 'DIFIERE') + '</span></td></tr>';
        });
        h += '</tbody></table></div></div>';
      });
    }
    return h;
  }

  /* ====================================================================== *
   * PANTALLA: EXPORTACION
   * ====================================================================== */
  function vistaExportar() {
    if (!S.resultado) {
      return '<div class="vacio"><div class="ic">↧</div><div class="t">Sin resultados que exportar</div>' +
        '<button class="btn pri" style="margin-top:14px" data-ir="proceso">Ir a Procesamiento</button></div>';
    }
    var res = APP.Validaciones.resumen(S.alertas);
    var h = '';
    if (res.CRITICA) {
      h += '<div class="aviso crit"><b>Hay ' + res.CRITICA + ' alertas criticas sin resolver</b>' +
        'Puede exportar de todos modos: el archivo incluye la pestania de alertas y la de auditoria. ' +
        'Revise las alertas antes de usar el resultado para una declaracion o determinacion tributaria.</div>';
    }
    h += '<div class="tarjeta"><header><h2>Anexo de JP y BD en Excel</h2></header><div class="cuerpo">' +
      '<p class="nota" style="margin-bottom:12px">Se generan 17 pestanias. Las filas de totales se escriben como ' +
      'formulas <code class="k">=SUMA()</code> con su valor calculado precargado.</p>' +
      '<div class="rejilla c3" style="margin-bottom:16px">';
    ['1. Base empleados', '2. Resumen unificado', '3. JP', '4. BD', '5. Deducibilidad', '6. Movimiento deducible',
     '7. Salidas anticipadas', '8. Ingresos gravados', '9. Ingresos no gravados', '10. ORI negativo',
     '11. Impuesto diferido', '12. Reversiones', '13. Ing. gravado adicional', '14. Conciliaciones',
     '15. Alertas', '16. Parametros', '17. Auditoria'].forEach(function (n) {
      h += '<div class="nota">' + esc(n) + '</div>';
    });
    h += '</div>';
    h += '<label class="fila" style="margin-bottom:12px"><input type="checkbox" id="inc-auditoria" checked> ' +
      '<span class="nota">Incluir la pestania de auditoria y trazabilidad (una fila por campo calculado; ' +
      'puede ser grande en bases extensas).</span></label>';
    h += '<label class="campo" style="max-width:340px;margin-bottom:14px"><span>Nombre de la compania (opcional)</span>' +
      '<input type="text" id="compania" value="' + esc(S.cfg.meta.compania || '') + '"></label>';
    h += '<button class="btn pri grande" data-accion="exportar">Generar Anexo en Excel</button>';
    h += '</div></div>';
    return h;
  }

  /* ====================================================================== *
   * PANTALLA: DATOS Y SEGURIDAD
   * ====================================================================== */
  function vistaSeguridad() {
    var h = '<div class="tarjeta"><header><h2>Confidencialidad</h2></header><div class="cuerpo">' +
      '<p class="nota">La informacion laboral, actuarial, contable y tributaria que se carga en este programa ' +
      'es confidencial. Por eso:</p><ul class="nota" style="margin-top:8px;line-height:1.9">' +
      '<li>Todo el procesamiento ocurre en este equipo, dentro del navegador.</li>' +
      '<li>No se realiza ninguna llamada de red: el programa funciona sin conexion a internet.</li>' +
      '<li>Los archivos cargados viven solo en memoria y se pierden al cerrar la pestania.</li>' +
      '<li>Lo unico que se guarda de forma persistente son los parametros y reglas tributarias ' +
      '(no contienen datos de empleados), en el almacenamiento local de este navegador.</li>' +
      '<li>La exportacion se escribe directamente en su carpeta de descargas.</li>' +
      '</ul></div></div>';

    h += '<div class="tarjeta"><header><h2>Datos en memoria</h2></header><div class="cuerpo">' +
      '<div class="rejilla c4" style="margin-bottom:14px">' +
      '<div class="kpi"><div class="et">Archivos</div><div class="v">' + fmt0(S.archivos.length) + '</div></div>' +
      '<div class="kpi"><div class="et">Registros actuariales</div><div class="v">' + fmt0(S.actuariales.length) + '</div></div>' +
      '<div class="kpi"><div class="et">Lineas de resumen</div><div class="v">' + fmt0(S.resumenes.length) + '</div></div>' +
      '<div class="kpi"><div class="et">Registros contables</div><div class="v">' + fmt0(S.contables.length) + '</div></div>' +
      '</div><div class="fila">' +
      '<button class="btn peligro" data-accion="limpiar-archivos">Eliminar los archivos cargados</button>' +
      '<button class="btn peligro" data-accion="borrar-todo">Borrar todo (datos y parametros)</button>' +
      '</div></div></div>';

    h += '<div class="tarjeta"><header><h2>Respaldo del proyecto</h2></header><div class="cuerpo">' +
      '<p class="nota" style="margin-bottom:10px">Guarde junto al expediente del cliente: el archivo del programa, ' +
      'los parametros en formato JSON y el Anexo exportado. Con esos tres elementos el analisis es reproducible.</p>' +
      '<div class="fila"><button class="btn" data-accion="cfg-exportar">Exportar parametros (.json)</button>' +
      '<button class="btn" data-accion="plantillas">Descargar plantillas de carga</button></div></div></div>';

    h += '<div class="tarjeta"><header><h2>Aviso profesional</h2></header><div class="cuerpo">' +
      '<div class="aviso"><b>Las reglas cargadas son la logica inicial del proyecto</b>' +
      'Provienen del Excel de procedimiento y deben contrastarse con la normativa tributaria ecuatoriana vigente ' +
      'antes de utilizar el programa para una declaracion o determinacion tributaria real. Las reglas marcadas como ' +
      '"Consulta vinculante" (JP y BD 2022-2023) estan sujetas a pronunciamiento del SRI.</div></div></div>';
    return h;
  }

  /* ====================================================================== *
   * MODAL DE CLASIFICACION MANUAL ERI / ORI (paso 8)
   * ====================================================================== */
  function abrirClasificacion(clave) {
    var f = S.resultado.filaPorClave[clave];
    if (!f) return;
    var ov = S.overrides[clave] || {};
    var h = '<div class="modal-fondo" data-cerrar-fondo><div class="modal" style="max-width:600px">' +
      '<header><h3>Clasificacion de la salida · ' + esc(f.nombre_original) + ' · ' + f.regimen + ' ' + f.anio +
      '</h3><button class="x" data-accion="cerrar-modal">×</button></header><div class="cuerpo">' +
      '<div class="aviso"><b>Paso 8 del procedimiento</b>Esta clasificacion debe sustentarse en el mayor contable ' +
      'o en el informe de auditoria. El programa no la asume por su cuenta.</div>' +
      '<div class="nota" style="margin-bottom:12px"><b>Salidas anticipadas del periodo:</b> ' +
      fmt(f.salidas_anticipadas) + ' · <b>Pasivo final:</b> ' + fmt(f.pasivo_final) +
      ' · <b>Fuente actual:</b> ' + esc(f.clasificacion_fuente) + '</div>' +
      '<div class="rejilla c2">' +
      '<label class="campo"><span>Importe registrado contra ERI</span>' +
      '<input type="number" step="0.01" id="ov-eri" value="' +
      (ov.salida_eri !== undefined ? ov.salida_eri : (f.salida_eri === null ? '' : f.salida_eri)) + '"></label>' +
      '<label class="campo"><span>Importe registrado contra ORI</span>' +
      '<input type="number" step="0.01" id="ov-ori" value="' +
      (ov.salida_ori !== undefined ? ov.salida_ori : (f.salida_ori === null ? '' : f.salida_ori)) + '"></label>' +
      '<label class="campo"><span>Status laboral (ajuste manual)</span><select id="ov-status">' +
      '<option value="">(mantener: ' + esc(f.status) + ')</option>' +
      APP.STATUS.map(function (s) {
        return '<option value="' + s + '"' + (ov.status === s ? ' selected' : '') + '>' + s + '</option>';
      }).join('') + '</select></label>' +
      '</div><p class="nota mini" style="margin-top:10px">Los ajustes se aplican al volver a ejecutar el analisis.</p>' +
      '</div><footer>' +
      '<button class="btn" data-accion="quitar-override" data-clave="' + esc(clave) + '">Quitar ajuste</button>' +
      '<button class="btn" data-accion="cerrar-modal">Cancelar</button>' +
      '<button class="btn pri" data-accion="guardar-override" data-clave="' + esc(clave) + '">Guardar ajuste</button>' +
      '</footer></div></div>';
    U.$('#modal').innerHTML = h;
  }

  /* ====================================================================== *
   * PLANTILLAS DE CARGA
   * ====================================================================== */
  APP.Plantillas = {
    descargar: function () {
      var wb = XLSX.utils.book_new();
      var actu = [
        ['Anio', 'Regimen', 'Nombre', 'Cedula', 'Sexo', 'Edad', 'TS', 'Status',
         'Pasivo neto del anio anterior', 'Costo laboral', 'Interes financiero', 'Incremento',
         'Costo por servicios pasados', 'ORI', 'Salidas anticipadas', 'Valores de traspasos', 'Pagos',
         'Pasivo neto', 'Fondeo', 'Salida ERI', 'Salida ORI'],
        [2018, 'JP', 'JUAN PEREZ', '0912345678', 'M', 45, 12, 'Activo',
         5000, 1000, 200, 1200, 0, 300, 0, 0, 0, 6500, 'NO', '', ''],
        [2018, 'BD', 'JUAN PEREZ', '0912345678', 'M', 45, 12, 'Activo',
         1200, 250, 50, 300, 0, 40, 0, 0, 0, 1540, '', '', '']
      ];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(actu), 'Detalle de empleados');

      var resu = [
        ['Anio', 'Regimen', 'Concepto', 'Valor'],
        [2018, 'JP', 'Pasivo neto del anio anterior', 5000],
        [2018, 'JP', 'Costo laboral', 1000],
        [2018, 'JP', 'Interes financiero', 200],
        [2018, 'JP', 'ORI', 300],
        [2018, 'JP', 'Pagos', 0],
        [2018, 'JP', 'Pasivo neto', 6500]
      ];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(resu), 'Resumen actuarial');

      var cont = [
        ['Anio', 'Regimen', 'Nombre', 'Salida ERI', 'Salida ORI', 'Registro contable', 'Observacion'],
        [2019, 'JP', 'JUAN PEREZ', 6500, 0, 'ERI', 'Mayor 5.1.02.03 - asiento 1204 / informe de auditoria pag. 18']
      ];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(cont), 'Informacion contable');

      var guia = [
        ['PLANTILLAS DE CARGA - ANEXO DE JP Y BD'],
        [],
        ['Hoja "Detalle de empleados"'],
        ['Una fila por empleado, regimen y anio. Corresponde al paso 1 del procedimiento.'],
        ['Regimen: JP (Jubilacion Patronal) o BD (Bonificacion por Desahucio).'],
        ['Status: Activo, Ingreso, Salida o Jubilado. Si se deja vacio el programa lo deriva del cruce entre anios.'],
        ['Incremento es opcional: el programa lo calcula como Costo laboral + Interes financiero y avisa si difiere.'],
        ['Pasivo neto (final) es opcional: si falta se calcula con la formula de movimiento.'],
        ['Fondeo solo incide en JP 2021. Si se deja vacio se usa el parametro general del anio.'],
        [],
        ['Hoja "Resumen actuarial"'],
        ['Totales declarados por el actuario. Se usan para la conciliacion del paso 4.'],
        ['Cargue una vez para JP y otra para BD, o use la columna Regimen.'],
        [],
        ['Hoja "Informacion contable"'],
        ['Sustento de la clasificacion ERI / ORI de las salidas anticipadas (paso 8).'],
        ['Sin esta informacion el programa deja la salida en REVISION MANUAL y no asume el tratamiento.'],
        [],
        ['Los encabezados pueden variar: el programa reconoce sinonimos y permite corregir el mapeo al cargar.']
      ];
      var wsG = XLSX.utils.aoa_to_sheet(guia);
      wsG['!cols'] = [{ wch: 110 }];
      XLSX.utils.book_append_sheet(wb, wsG, 'Instrucciones');

      XLSX.writeFile(wb, 'Plantillas - Anexo JP y BD.xlsx');
      U.toast('Plantillas descargadas', 'ok');
    }
  };

  /* ====================================================================== *
   * REGISTRO DE VISTAS Y ACCIONES
   * ====================================================================== */
  U.VISTAS.resultados = vistaResultados;
  U.VISTAS.alertas = vistaAlertas;
  U.VISTAS.traza = vistaTraza;
  U.VISTAS.pruebas = vistaPruebas;
  U.VISTAS.exportar = vistaExportar;
  U.VISTAS.seguridad = vistaSeguridad;

  APP.UI_ACCIONES = {
    'sub': function (t) { S.sub = t.getAttribute('data-s'); U.pintar(); },

    'ver-traza': function (t) {
      S.traza = t.getAttribute('data-i');
      S.pantalla = 'traza';
      U.pintar();
      var el = document.querySelectorAll('.tarjeta');
      if (el.length > 1) el[el.length - 1].scrollIntoView({ behavior: 'smooth', block: 'start' });
    },

    'clasificar': function (t) { abrirClasificacion(t.getAttribute('data-i')); },

    'guardar-override': function (t) {
      var clave = t.getAttribute('data-clave');
      var eri = U.$('#ov-eri').value, ori = U.$('#ov-ori').value, st = U.$('#ov-status').value;
      var ov = {};
      if (eri !== '') ov.salida_eri = Number(eri);
      if (ori !== '') ov.salida_ori = Number(ori);
      if (st) ov.status = st;
      S.overrides[clave] = ov;
      U.$('#modal').innerHTML = '';
      U.toast('Ajuste guardado. Vuelva a ejecutar el analisis para aplicarlo.', 'ok');
      U.pintar();
    },

    'quitar-override': function (t) {
      delete S.overrides[t.getAttribute('data-clave')];
      U.$('#modal').innerHTML = '';
      U.toast('Ajuste eliminado', 'ok');
      U.pintar();
    },

    'toggle-caso': function (t) {
      var el = document.getElementById('caso-' + t.getAttribute('data-i'));
      if (el) el.classList.toggle('abierto');
    },

    'correr-pruebas': function () {
      S.pruebas = APP.Pruebas.ejecutarTodos();
      var r = APP.Pruebas.resumen(S.pruebas);
      U.toast(r.pasan + ' de ' + r.total + ' casos pasan', r.fallan ? 'error' : 'ok');
      U.pintar();
    },

    'exportar': function () {
      var inc = U.$('#inc-auditoria');
      var comp = U.$('#compania');
      if (comp) { S.cfg.meta.compania = comp.value; U.guardar(); }
      U.toast('Generando el archivo...');
      setTimeout(function () {
        try {
          var wb = APP.Exportar.generar(S.resultado, S.cfg, S.alertas, S.conciliaciones,
            { incluirAuditoria: inc ? inc.checked : true });
          var nom = 'Anexo JP y BD' + (S.cfg.meta.compania ? ' - ' + S.cfg.meta.compania : '') +
            ' - ' + new Date().toISOString().substring(0, 10) + '.xlsx';
          APP.Exportar.descargar(wb, nom);
          U.toast('Anexo exportado', 'ok');
        } catch (e) {
          console.error(e);
          U.toast('Error al exportar: ' + (e.message || e), 'error');
        }
      }, 60);
    },

    'traza-exportar': function () {
      var fila = S.resultado.filaPorClave[S.traza];
      if (!fila) return;
      var wb = XLSX.utils.book_new();
      var aoa = [['Campo', 'Paso', 'Formula', 'Valores', 'Resultado', 'Regla', 'Fuente']];
      APP.Traza.describirFila(fila, S.cfg).forEach(function (t) {
        aoa.push([t.etiqueta, t.paso, t.formula,
          Object.keys(t.valores).map(function (k) { return k + ' = ' + t.valores[k]; }).join(' | '),
          t.resultado, t.regla, t.fuente]);
      });
      var ws = XLSX.utils.aoa_to_sheet(aoa);
      ws['!cols'] = [{ wch: 38 }, { wch: 24 }, { wch: 70 }, { wch: 80 }, { wch: 16 }, { wch: 50 }, { wch: 34 }];
      XLSX.utils.book_append_sheet(wb, ws, 'Traza');
      XLSX.writeFile(wb, 'Traza - ' + fila.nombre_original + ' - ' + fila.regimen + ' ' + fila.anio + '.xlsx');
      U.toast('Traza exportada', 'ok');
    },

    'borrar-todo': function () {
      if (!confirm('Se eliminaran los datos cargados Y los parametros guardados. Continuar?')) return;
      S.archivos = []; S.actuariales = []; S.resumenes = []; S.contables = [];
      S.resultado = null; S.alertas = []; S.conciliaciones = [];
      S.fusiones = {}; S.overrides = {}; S.pruebas = null; S.traza = null;
      APP.borrarConfig();
      S.cfg = APP.cargarConfig();
      U.toast('Todo borrado', 'ok');
      S.pantalla = 'dashboard';
      U.pintar();
    }
  };
})();
