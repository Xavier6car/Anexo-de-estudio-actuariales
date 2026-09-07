/* =============================================================================
 * MODULO: EXPORTACION A EXCEL
 * -----------------------------------------------------------------------------
 * Genera el archivo final con las 17 pestanias del prompt (seccion 27).
 * Las filas de totales se escriben como FORMULAS de Excel (=SUMA) con su valor
 * calculado precargado, de modo que el archivo se abre con los numeros visibles
 * y a la vez conserva la formula viva.
 * ========================================================================== */
var APP = window.APP;

APP.Exportar = (function () {

  function nz(v) { return (v === null || v === undefined || v === '' || (typeof v === 'number' && isNaN(v))) ? null : v; }
  function si(b) { return b === null || b === undefined ? '' : (b ? 'SI' : 'NO'); }
  function pct(v) { return (v === null || v === undefined || v === '') ? '' : (Number(v) * 100).toFixed(2) + '%'; }

  /* --- Construccion de hojas ---------------------------------------------- */

  /** Crea una hoja a partir de encabezados + filas, con fila de totales opcional. */
  function hoja(headers, filas, columnasSumables) {
    var aoa = [headers].concat(filas);
    var ws = XLSX.utils.aoa_to_sheet(aoa);
    var nFilas = filas.length;

    if (columnasSumables && columnasSumables.length && nFilas > 0) {
      var filaTot = nFilas + 1;                 // 0-based: encabezado 0, datos 1..n
      var etiquetaCol = XLSX.utils.encode_col(0);
      ws[etiquetaCol + (filaTot + 1)] = { t: 's', v: 'TOTAL' };
      columnasSumables.forEach(function (ci) {
        var col = XLSX.utils.encode_col(ci);
        var suma = 0;
        for (var r = 0; r < nFilas; r++) {
          var v = filas[r][ci];
          if (typeof v === 'number' && isFinite(v)) suma += v;
        }
        ws[col + (filaTot + 1)] = {
          t: 'n', v: suma,
          f: 'SUM(' + col + '2:' + col + (filaTot) + ')'
        };
      });
      var rng = XLSX.utils.decode_range(ws['!ref']);
      rng.e.r = filaTot;
      ws['!ref'] = XLSX.utils.encode_range(rng);
    }

    // anchos de columna razonables
    ws['!cols'] = headers.map(function (h) {
      return { wch: Math.min(42, Math.max(10, String(h).length + 2)) };
    });
    ws['!freeze'] = { xSplit: 0, ySplit: 1 };
    ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: 0, c: headers.length - 1 } }) };
    return ws;
  }

  function indices(headers, nombres) {
    return nombres.map(function (n) { return headers.indexOf(n); }).filter(function (i) { return i >= 0; });
  }

  /* --- 1. Base de empleados ---------------------------------------------- */
  function hojaEmpleados(res) {
    var h = ['ID empleado', 'Nombre canonico', 'Nombre normalizado', 'Escrituras encontradas',
             'Sexo', 'Anios con informacion', 'Regimenes', 'Claves fusionadas'];
    var filas = res.empleados.map(function (e) {
      return [e.empleado_id, e.nombre_canonico, e.nombre_norm,
              e.nombres_originales.join(' | '), e.sexo,
              e.anios.join(', '), e.regimenes.join(', '),
              (e.claves_fusionadas || []).join(' | ')];
    });
    return hoja(h, filas, []);
  }

  /* --- 2. Resumen unificado (horizontal por empleado y anio) -------------- */
  function hojaResumenUnificado(res) {
    var campos = [
      ['Status', 'status'], ['TS', 'ts'], ['Deducible', 'deducible_txt'],
      ['Pasivo inicial', 'pasivo_inicial'], ['Costo laboral', 'costo_laboral'],
      ['Interes financiero', 'interes_financiero'], ['Costo serv. pasados', 'costo_servicios_pasados'],
      ['ORI', 'ori'], ['Traspasos', 'traspasos'], ['Pagos', 'pagos'],
      ['Salida ant. ERI', 'salida_eri'], ['Salida ant. ORI', 'salida_ori'],
      ['Pasivo final', 'pasivo_final']
    ];
    var h = ['ID empleado', 'Empleado', 'Regimen'];
    res.anios.forEach(function (a) {
      campos.forEach(function (c) { h.push(a + ' ' + c[0]); });
    });

    var porEmp = {};
    res.filas.forEach(function (f) {
      var k = f.empleado_id + '|' + f.regimen;
      (porEmp[k] = porEmp[k] || {})[f.anio] = f;
    });

    var filas = [];
    Object.keys(porEmp).sort().forEach(function (k) {
      var partes = k.split('|');
      var emp = res.empleados.filter(function (e) { return e.empleado_id === partes[0]; })[0];
      var fila = [partes[0], emp ? emp.nombre_canonico : partes[0], partes[1]];
      res.anios.forEach(function (a) {
        var f = porEmp[k][a];
        campos.forEach(function (c) {
          if (!f) { fila.push(null); return; }
          if (c[1] === 'deducible_txt') {
            fila.push(f.deducible === null ? 'NO DETERMINADO' : (f.deducible ? 'DEDUCIBLE' : 'NO DEDUCIBLE'));
          } else { fila.push(nz(f[c[1]])); }
        });
      });
      filas.push(fila);
    });

    var sumables = [];
    h.forEach(function (nombre, i) {
      if (/Pasivo|Costo|Interes|ORI$|Traspasos|Pagos|Salida ant/.test(nombre)) sumables.push(i);
    });
    return hoja(h, filas, sumables);
  }

  /* --- 3 y 4. Detalle por regimen ---------------------------------------- */
  var H_DETALLE = ['Anio', 'Regimen', 'ID empleado', 'Empleado', 'Nombre normalizado', 'Cedula', 'Sexo', 'Edad',
    'TS', 'Status', 'Origen del status', 'Cruce', 'Pasivo inicial', 'Origen pasivo inicial',
    'Costo laboral', 'Interes financiero', 'Incremento', 'Costo serv. pasados', 'ORI',
    'Traspasos', 'Pagos', 'Salidas anticipadas', 'Pasivo final', 'Origen pasivo final',
    'Pasivo final (formula)', 'Diferencia', 'Archivo origen', 'Hoja', 'Fila'];

  function filaDetalle(f) {
    return [f.anio, f.regimen, f.empleado_id, f.nombre_original, f.nombre_norm, f.cedula, f.sexo,
      nz(f.edad), nz(f.ts), f.status, f.status_origen, f.cruce, nz(f.pasivo_inicial), f.pasivo_inicial_origen,
      nz(f.costo_laboral), nz(f.interes_financiero), nz(f.incremento), nz(f.costo_servicios_pasados), nz(f.ori),
      nz(f.traspasos), nz(f.pagos), nz(f.salidas_anticipadas), nz(f.pasivo_final), f.pasivo_final_origen,
      nz(f.pasivo_final_formula), nz(f.dif_pasivo_final),
      f._origen ? f._origen.archivo : '', f._origen ? f._origen.hoja : '', f._origen ? f._origen.fila : ''];
  }

  function hojaRegimen(res, reg) {
    var filas = res.filas.filter(function (f) { return f.regimen === reg; }).map(filaDetalle);
    return hoja(H_DETALLE, filas, indices(H_DETALLE,
      ['Pasivo inicial', 'Costo laboral', 'Interes financiero', 'Incremento', 'Costo serv. pasados',
       'ORI', 'Traspasos', 'Pagos', 'Salidas anticipadas', 'Pasivo final', 'Diferencia']));
  }

  /* --- 5. Deducibilidad --------------------------------------------------- */
  function hojaDeducibilidad(res) {
    var h = ['Anio', 'Regimen', 'ID empleado', 'Empleado', 'TS', 'TS >= 10', 'Fondeo', 'Origen fondeo',
             'Regla aplicada', 'Estado de la regla', 'Tratamiento', 'Deducible', 'Considera ID',
             'Nota de la regla', 'Fuente de la regla'];
    var filas = res.filas.map(function (f) {
      return [f.anio, f.regimen, f.empleado_id, f.nombre_original, nz(f.ts),
        f.ts_mayor_10 === null ? '' : si(f.ts_mayor_10),
        f.fondeo === null ? '' : si(f.fondeo), f.fondeo_origen,
        f.regla_id || 'NINGUNA', f.regla_estado, f.tratamiento,
        f.deducible === null ? 'NO DETERMINADO' : si(f.deducible),
        f.aplica_id === null ? 'NO DETERMINADO' : si(f.aplica_id),
        f.regla_nota, f.regla_fuente];
    });
    return hoja(h, filas, []);
  }

  /* --- 6. Movimiento de valores deducibles -------------------------------- */
  function hojaMovimiento(res) {
    var h = ['Anio', 'Regimen', 'ID empleado', 'Empleado', 'Deducible', 'ERI', 'ORI',
             'Saldo deducible anio anterior', 'Saldo deducible al 31-dic', 'Pasivo final',
             'Saldo no deducible al 31-dic'];
    var filas = res.filas.map(function (f) {
      return [f.anio, f.regimen, f.empleado_id, f.nombre_original,
        f.deducible === null ? 'NO DETERMINADO' : si(f.deducible),
        nz(f.mov_eri), nz(f.mov_ori), nz(f.saldo_deducible_anterior),
        nz(f.saldo_deducible), nz(f.pasivo_final), nz(f.saldo_no_deducible)];
    });
    return hoja(h, filas, indices(h, ['ERI', 'ORI', 'Saldo deducible al 31-dic', 'Pasivo final',
                                      'Saldo no deducible al 31-dic']));
  }

  /* --- 7. Salidas anticipadas --------------------------------------------- */
  function hojaSalidas(res) {
    var h = ['Anio', 'Regimen', 'ID empleado', 'Empleado', 'Status', 'Pasivo final',
             'Salidas anticipadas', 'Salida anticipada', 'Detalle de la evaluacion',
             'Salida ERI', 'Salida ORI', 'Clasificacion P&G', 'Estado', 'Fuente de la clasificacion',
             'Pago con cargo a la provision', 'Pagos del anio', 'Base AID acumulada',
             'Deduccion adicional', 'Formula de la deduccion adicional'];
    var filas = res.filas.filter(function (f) {
      return f.status === 'SALIDA' || f.salida_anticipada === 'SI';
    }).map(function (f) {
      return [f.anio, f.regimen, f.empleado_id, f.nombre_original, f.status, nz(f.pasivo_final),
        nz(f.salidas_anticipadas), f.salida_anticipada, f.salida_anticipada_detalle,
        nz(f.salida_eri), nz(f.salida_ori), f.clasificacion_pg || '', f.clasificacion_estado,
        f.clasificacion_fuente, f.pago_con_cargo_provision, nz(f.pagos), nz(f.base_id_acumulada),
        nz(f.deduccion_adicional), f.deduccion_adicional_formula];
    });
    return hoja(h, filas, indices(h, ['Pasivo final', 'Salidas anticipadas', 'Salida ERI', 'Salida ORI',
                                      'Pagos del anio', 'Deduccion adicional']));
  }

  /* --- 8 y 9. Ingresos gravados / no gravados ----------------------------- */
  function hojaIngresos(res, tipo) {
    var esGravado = tipo === 'gravado';
    var h = ['Anio', 'Regimen', 'ID empleado', 'Empleado', 'Salida anticipada',
             esGravado ? 'Saldo deducible utilizado' : 'Saldo no deducible utilizado',
             esGravado ? 'Salida anticipada ORI' : 'Salida anticipada ERI',
             esGravado ? 'Ingreso gravado' : 'Ingreso no gravado', 'Formula aplicada'];
    var filas = res.filas.filter(function (f) {
      return esGravado ? f.ingreso_gravado > 0 : f.ingreso_no_gravado > 0;
    }).map(function (f) {
      return [f.anio, f.regimen, f.empleado_id, f.nombre_original, f.salida_anticipada,
        nz(esGravado ? f.base_ingreso_gravado : f.base_ingreso_no_gravado),
        nz(esGravado ? f.salida_ori : f.salida_eri),
        nz(esGravado ? f.ingreso_gravado : f.ingreso_no_gravado),
        esGravado ? f.ingreso_gravado_formula : f.ingreso_no_gravado_formula];
    });
    return hoja(h, filas, indices(h, [esGravado ? 'Ingreso gravado' : 'Ingreso no gravado']));
  }

  /* --- 10. ORI negativo ---------------------------------------------------- */
  function hojaOriNegativo(res) {
    var h = ['Anio', 'Regimen', 'ID empleado', 'Empleado', 'Status', 'Empleado vigente',
             'ORI del periodo', 'ORI negativo', 'Saldo base por compensar (anio anterior)',
             'Saldo base compensado', 'Saldo base por compensar', 'Considerar en diferido'];
    var filas = res.filas.filter(function (f) { return f.ori_negativo !== null; }).map(function (f) {
      return [f.anio, f.regimen, f.empleado_id, f.nombre_original, f.status, f.empleado_activo_iga,
        nz(f.ori), nz(f.ori_negativo), nz(f.por_compensar_anterior),
        nz(f.saldo_2017_compensado), nz(f.saldo_2017_por_compensar), nz(f.considerar_en_diferido)];
    });
    return hoja(h, filas, indices(h, ['ORI del periodo', 'ORI negativo', 'Considerar en diferido']));
  }

  /* --- 11. Impuesto diferido ---------------------------------------------- */
  function hojaImpuestoDiferido(res) {
    var h = ['Anio', 'Regimen', 'ID empleado', 'Empleado', 'Status', 'Considera ID', 'Regla',
             'Incremento', 'ERI ID', 'ORI del periodo', 'Saldo base compensado', 'ORI neto',
             'Total diferencia temporaria', 'Tarifa IR', 'Estado tarifa',
             'Impuesto diferido ERI', 'Impuesto diferido ORI',
             'Saldo diferido ERI', 'Saldo diferido ORI', 'Saldo diferido activo'];
    var filas = res.filas.filter(function (f) { return f.eri_id !== null; }).map(function (f) {
      return [f.anio, f.regimen, f.empleado_id, f.nombre_original, f.status,
        f.aplica_id === null ? 'NO DETERMINADO' : si(f.aplica_id), f.regla_id || '',
        nz(f.incremento), nz(f.eri_id), nz(f.ori), nz(f.saldo_2017_compensado), nz(f.ori_neto),
        nz(f.total_dif_temporaria), pct(f.tarifa_ir), f.tarifa_ir_estado,
        nz(f.id_eri), nz(f.id_ori), nz(f.saldo_dif_eri), nz(f.saldo_dif_ori), nz(f.saldo_dif_activo)];
    });
    return hoja(h, filas, indices(h, ['Incremento', 'ERI ID', 'ORI neto', 'Total diferencia temporaria',
                                      'Impuesto diferido ERI', 'Impuesto diferido ORI',
                                      'Saldo diferido ERI', 'Saldo diferido ORI', 'Saldo diferido activo']));
  }

  /* --- 12. Reversiones ----------------------------------------------------- */
  function hojaReversiones(res) {
    var h = ['Anio', 'Regimen', 'ID empleado', 'Empleado', 'Status',
             'Reversion AID ERI', 'Reversion AID ORI', 'Detalle',
             'Saldo diferido ERI', 'Saldo diferido ORI', 'Composicion del saldo',
             'Pago con cargo a la provision', 'Deduccion adicional'];
    var filas = res.filas.filter(function (f) {
      return (f.rev_aid_eri && f.rev_aid_eri !== 0) || (f.rev_aid_ori && f.rev_aid_ori !== 0) ||
             (f.deduccion_adicional && f.deduccion_adicional !== 0);
    }).map(function (f) {
      return [f.anio, f.regimen, f.empleado_id, f.nombre_original, f.status,
        nz(f.rev_aid_eri), nz(f.rev_aid_ori), f.rev_aid_detalle,
        nz(f.saldo_dif_eri), nz(f.saldo_dif_ori), f.saldo_dif_origen,
        f.pago_con_cargo_provision, nz(f.deduccion_adicional)];
    });
    return hoja(h, filas, indices(h, ['Reversion AID ERI', 'Reversion AID ORI', 'Deduccion adicional']));
  }

  /* --- 13. Ingreso gravado adicional --------------------------------------- */
  function hojaIngresoGravadoAdicional(res) {
    var h = ['Anio', 'Regimen', 'ID empleado', 'Empleado', 'Status', 'Empleado activo',
             'ORI del periodo', 'ORI negativo', 'Saldo deducible del anio base por compensar (anterior)',
             'Saldo por compensar (anio)', 'Ingreso gravado adicional'];
    var filas = res.filas.filter(function (f) { return f.ingreso_gravado_adicional !== null; })
      .map(function (f) {
        return [f.anio, f.regimen, f.empleado_id, f.nombre_original, f.status, f.empleado_activo_iga,
          nz(f.ori), nz(f.ori_negativo), nz(f.por_compensar_anterior),
          nz(f.saldo_2017_por_compensar), nz(f.ingreso_gravado_adicional)];
      });
    return hoja(h, filas, indices(h, ['ORI negativo', 'Ingreso gravado adicional']));
  }

  /* --- 14. Conciliaciones --------------------------------------------------- */
  function hojaConciliaciones(conc) {
    var h = ['Anio', 'Regimen', 'Concepto', 'Valor actuarial', 'Valor calculado', 'Diferencia',
             'Bajas del periodo', 'Altas del periodo', 'Residual',
             'Estado', 'Fuente', 'Texto original del resumen'];
    var filas = (conc || []).map(function (c) {
      return [c.anio, c.regimen, c.concepto, nz(c.valor_actuarial), nz(c.valor_calculado),
        nz(c.diferencia), nz(c.bajas), nz(c.altas), nz(c.residual),
        c.estado, c.fuente, c.texto_original];
    });
    return hoja(h, filas, []);
  }

  /* --- 15. Alertas ----------------------------------------------------------- */
  function hojaAlertas(alertas) {
    var h = ['Severidad', 'Tipo', 'Titulo', 'Anio', 'Regimen', 'ID empleado', 'Empleado', 'Detalle', 'Fuente'];
    var filas = (alertas || []).map(function (a) {
      return [a.severidad, a.tipo, a.titulo, a.anio, a.regimen, a.empleado_id, a.empleado, a.detalle, a.fuente];
    });
    return hoja(h, filas, []);
  }

  /* --- 16. Parametros -------------------------------------------------------- */
  function hojaParametros(cfg, res) {
    var aoa = [];
    aoa.push(['PARAMETROS DEL ANALISIS']);
    aoa.push([]);
    aoa.push(['Version del programa', APP.VERSION]);
    aoa.push(['Compania', cfg.meta.compania || '(no indicada)']);
    aoa.push(['Generado', new Date().toLocaleString()]);
    aoa.push(['Anios procesados', (res.anios || []).join(', ')]);
    aoa.push([]);
    aoa.push(['ANCLAS DEL ANALISIS']);
    aoa.push(['Anio base (saldo inicial)', cfg.anclas.anio_base]);
    aoa.push(['Inicio del analisis de impuesto diferido', cfg.anclas.anio_inicio_id]);
    aoa.push(['Inicio del uso del ID por pagos', cfg.anclas.anio_inicio_reversos_pago]);
    aoa.push([]);
    aoa.push(['TARIFA DE IMPUESTO A LA RENTA POR ANIO']);
    aoa.push(['Anio', 'Tarifa']);
    (res.anios || []).forEach(function (a) {
      var t = cfg.tarifas_ir[a];
      aoa.push([a, (t === undefined || t === null || t === '') ? 'NO CONFIGURADA' : pct(t)]);
    });
    aoa.push([]);
    aoa.push(['FONDEO POR ANIO (incide en JP 2021)']);
    aoa.push(['Anio', 'Fondeo', 'Es supuesto']);
    Object.keys(cfg.fondeo || {}).forEach(function (a) {
      aoa.push([Number(a), si(cfg.fondeo[a]), cfg.fondeo_es_supuesto ? 'SI' : 'NO']);
    });
    aoa.push([]);
    aoa.push(['OPCIONES DE CALCULO']);
    aoa.push(['Base de saldos para salidas', cfg.opciones.base_saldos_salida]);
    aoa.push(['Signo de la reversion AID', cfg.opciones.signo_reversion_aid]);
    aoa.push(['Origen del saldo del anio base', cfg.opciones.origen_saldo_anio_base]);
    aoa.push(['Pasivo final tomado del archivo', si(cfg.opciones.pasivo_final_desde_archivo)]);
    aoa.push(['Tolerancia de conciliacion', cfg.opciones.tolerancia_conciliacion]);
    aoa.push(['Umbral de similitud de nombres', cfg.opciones.umbral_similitud_nombres]);
    aoa.push([]);
    aoa.push(['REGLAS TRIBUTARIAS APLICADAS']);
    aoa.push(['Id', 'Regimen', 'Desde', 'Hasta', 'TS min', 'TS max', 'Fondeo',
              'Deducible', 'Considera ID', 'Estado', 'Nota', 'Fuente']);
    (cfg.reglas_jp || []).concat(cfg.reglas_bd || []).forEach(function (r) {
      aoa.push([r.id, r.regimen, r.desde === null ? 'inicio' : r.desde, r.hasta === null ? 'fin' : r.hasta,
        r.ts_min === null ? '' : r.ts_min, r.ts_max === null ? '' : r.ts_max,
        r.fondeo === null ? 'indiferente' : si(r.fondeo),
        si(r.deducible), si(r.impuesto_diferido), r.estado, r.nota, r.fuente]);
    });

    var ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = [{ wch: 42 }, { wch: 16 }, { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 10 },
                   { wch: 14 }, { wch: 12 }, { wch: 14 }, { wch: 22 }, { wch: 70 }, { wch: 22 }];
    return ws;
  }

  /* --- 17. Auditoria / trazabilidad ------------------------------------------ */
  function hojaAuditoria(res, cfg, limite) {
    var h = ['Anio', 'Regimen', 'ID empleado', 'Empleado', 'Campo', 'Paso del Excel',
             'Formula aplicada', 'Valores utilizados', 'Resultado', 'Regla tributaria', 'Fuente'];
    var filas = [];
    var max = limite || 200000;
    for (var i = 0; i < res.filas.length && filas.length < max; i++) {
      var f = res.filas[i];
      APP.Traza.describirFila(f, cfg).forEach(function (t) {
        if (filas.length >= max) return;
        var vals = Object.keys(t.valores).map(function (k) { return k + ' = ' + t.valores[k]; }).join(' | ');
        filas.push([t.anio, t.regimen, t.empleado_id, t.empleado, t.etiqueta, t.paso,
          t.formula, vals, t.resultado, t.regla, t.fuente]);
      });
    }
    return hoja(h, filas, []);
  }

  /* --- Libro completo ------------------------------------------------------- */
  function generar(res, cfg, alertas, conciliaciones, opciones) {
    opciones = opciones || {};
    var wb = XLSX.utils.book_new();
    function add(ws, nombre) { XLSX.utils.book_append_sheet(wb, ws, nombre.substring(0, 31)); }

    add(hojaEmpleados(res), '1. Base empleados');
    add(hojaResumenUnificado(res), '2. Resumen unificado');
    add(hojaRegimen(res, 'JP'), '3. JP');
    add(hojaRegimen(res, 'BD'), '4. BD');
    add(hojaDeducibilidad(res), '5. Deducibilidad');
    add(hojaMovimiento(res), '6. Movimiento deducible');
    add(hojaSalidas(res), '7. Salidas anticipadas');
    add(hojaIngresos(res, 'gravado'), '8. Ingresos gravados');
    add(hojaIngresos(res, 'no_gravado'), '9. Ingresos no gravados');
    add(hojaOriNegativo(res), '10. ORI negativo');
    add(hojaImpuestoDiferido(res), '11. Impuesto diferido');
    add(hojaReversiones(res), '12. Reversiones');
    add(hojaIngresoGravadoAdicional(res), '13. Ing. gravado adicional');
    add(hojaConciliaciones(conciliaciones), '14. Conciliaciones');
    add(hojaAlertas(alertas), '15. Alertas');
    add(hojaParametros(cfg, res), '16. Parametros');
    if (opciones.incluirAuditoria !== false) {
      add(hojaAuditoria(res, cfg, opciones.limiteAuditoria), '17. Auditoria');
    }
    return wb;
  }

  function descargar(wb, nombreArchivo) {
    XLSX.writeFile(wb, nombreArchivo, { bookType: 'xlsx', compression: true });
  }

  return { generar: generar, descargar: descargar, hoja: hoja };
})();
