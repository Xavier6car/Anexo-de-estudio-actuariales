/* =============================================================================
 * MODULO: TRAZABILIDAD
 * -----------------------------------------------------------------------------
 * Prompt seccion 25: Resultado -> formula -> datos utilizados -> archivo de
 * origen -> anio -> empleado.
 *
 * En lugar de almacenar un registro de auditoria por cada celda (millones de
 * objetos), la traza se RECONSTRUYE bajo demanda a partir de la fila calculada,
 * que conserva todos sus insumos. El resultado es identico y el costo de
 * memoria es cero.
 * ========================================================================== */
var APP = window.APP;

APP.Traza = (function () {

  function nn(v, d) {
    if (v === null || v === undefined || v === '' || (typeof v === 'number' && isNaN(v))) return 's/d';
    if (typeof v === 'number') return v.toFixed(d === undefined ? 2 : d);
    return String(v);
  }

  /* Catalogo de campos calculados: etiqueta, paso del Excel, formula y insumos. */
  var CAMPOS = {
    status: {
      etiqueta: 'Status laboral', paso: 'Paso 2 (Excel C9)',
      formula: function () {
        return 'ACTIVO si continua vigente; INGRESO si es su primera aparicion; ' +
               'SALIDA si el actuarial lo presenta como cesante; JUBILADO si lo califica como tal.';
      },
      insumos: function (f) { return { 'Status en el archivo': f.status_origen, 'Cruce': f.cruce }; }
    },
    cruce: {
      etiqueta: 'Cruce con el anio anterior', paso: 'Paso 2 (Excel D9)',
      formula: function () { return 'BUSCARV del empleado en la base del anio inmediato anterior.'; },
      insumos: function (f) { return { 'Resultado': f.cruce, 'Detalle': f.cruce_detalle }; }
    },
    incremento: {
      etiqueta: 'Incremento', paso: 'Pasos 6 y 18 (Excel C28, C47)',
      formula: function () { return 'Incremento = Costo laboral + Interes financiero'; },
      insumos: function (f) {
        return { 'Costo laboral': nn(f.costo_laboral), 'Interes financiero': nn(f.interes_financiero) };
      }
    },
    pasivo_final: {
      etiqueta: 'Pasivo neto final', paso: 'Paso 4 (Excel C13)',
      formula: function (f) {
        return 'Origen del valor: ' + f.pasivo_final_origen + '. Formula de control: ' +
               'Pasivo inicial + Costo laboral + Interes financiero + Costo servicios pasados ' +
               '+ ORI + Traspasos - Pagos - Salidas anticipadas';
      },
      insumos: function (f) {
        return {
          'Pasivo inicial': nn(f.pasivo_inicial) + ' (' + f.pasivo_inicial_origen + ')',
          'Costo laboral': nn(f.costo_laboral),
          'Interes financiero': nn(f.interes_financiero),
          'Costo servicios pasados': nn(f.costo_servicios_pasados),
          'ORI': nn(f.ori),
          'Traspasos': nn(f.traspasos),
          'Pagos': nn(f.pagos),
          'Salidas anticipadas': nn(f.salidas_anticipadas),
          'Resultado de la formula': nn(f.pasivo_final_formula),
          'Diferencia contra el archivo': nn(f.dif_pasivo_final)
        };
      }
    },
    tratamiento: {
      etiqueta: 'Tratamiento tributario', paso: 'Paso 5 (Excel C14 a C24)',
      formula: function (f) { return f.regla_nota || 'Sin regla aplicable.'; },
      insumos: function (f) {
        return {
          'Regla aplicada': f.regla_id || 'NINGUNA',
          'Estado de la regla': f.regla_estado,
          'Fuente de la regla': f.regla_fuente,
          'Tiempo de servicio': nn(f.ts, 2),
          'Fondeo': f.fondeo === null ? 's/d' : (f.fondeo ? 'SI' : 'NO'),
          'Origen del fondeo': f.fondeo_origen,
          'Deducible': f.deducible === null ? 'NO DETERMINADO' : (f.deducible ? 'SI' : 'NO'),
          'Considera impuesto diferido': f.aplica_id === null ? 'NO DETERMINADO' : (f.aplica_id ? 'SI' : 'NO')
        };
      }
    },
    mov_eri: {
      etiqueta: 'ERI (movimiento deducible)', paso: 'Paso 6 (Excel C28)',
      formula: function () { return 'ERI = Incremento (Costo laboral + Interes financiero) si el anio es deducible; 0 en caso contrario.'; },
      insumos: function (f) {
        return { 'Incremento': nn(f.incremento), 'Deducible': f.deducible ? 'SI' : 'NO', 'Regla': f.regla_id };
      }
    },
    mov_ori: {
      etiqueta: 'ORI (movimiento deducible)', paso: 'Paso 6 (Excel C29)',
      formula: function () { return 'ORI = ORI del periodo si el anio es deducible; 0 en caso contrario.'; },
      insumos: function (f) {
        return { 'ORI del periodo': nn(f.ori), 'Deducible': f.deducible ? 'SI' : 'NO', 'Regla': f.regla_id };
      }
    },
    saldo_deducible: {
      etiqueta: 'Saldo deducible al 31 de diciembre', paso: 'Paso 6 (Excel C30)',
      formula: function () { return 'Saldo deducible = Saldo deducible del anio anterior + ERI deducible + ORI deducible'; },
      insumos: function (f) {
        return {
          'Saldo deducible anio anterior': nn(f.saldo_deducible_anterior),
          'ERI deducible': nn(f.mov_eri),
          'ORI deducible': nn(f.mov_ori)
        };
      }
    },
    saldo_no_deducible: {
      etiqueta: 'Saldo no deducible al 31 de diciembre', paso: 'Paso 6 (Excel C31)',
      formula: function () { return 'Saldo no deducible = MAX(0; Pasivo neto final - Saldo deducible)'; },
      insumos: function (f) {
        return { 'Pasivo neto final': nn(f.pasivo_final), 'Saldo deducible': nn(f.saldo_deducible) };
      }
    },
    salida_anticipada: {
      etiqueta: 'Salida anticipada', paso: 'Paso 7 (Excel C33)',
      formula: function () { return 'SI cuando Status = SALIDA Y Pasivo neto final = 0 Y existe importe en Salidas anticipadas.'; },
      insumos: function (f) {
        return {
          'Status': f.status, 'Pasivo neto final': nn(f.pasivo_final),
          'Salidas anticipadas': nn(f.salidas_anticipadas)
        };
      }
    },
    clasificacion_estado: {
      etiqueta: 'Clasificacion ERI / ORI de la salida', paso: 'Paso 8 (Excel C34, D34)',
      formula: function () {
        return 'Se determina con el mayor contable o el informe de auditoria. ' +
               'Sin evidencia, el estado queda en REVISION MANUAL: el programa no asume una clasificacion.';
      },
      insumos: function (f) {
        return {
          'Salida anticipada ERI': f.salida_eri === null ? 'sin evidencia' : nn(f.salida_eri),
          'Salida anticipada ORI': f.salida_ori === null ? 'sin evidencia' : nn(f.salida_ori),
          'Clasificacion P&G actuariales': f.clasificacion_pg || 'no determinada',
          'Fuente': f.clasificacion_fuente
        };
      }
    },
    ingreso_no_gravado: {
      etiqueta: 'Ingreso no gravado', paso: 'Paso 9 (Excel C35)',
      formula: function (f) { return f.ingreso_no_gravado_formula; },
      insumos: function (f) {
        return {
          'Salida anticipada': f.salida_anticipada,
          'Saldo no deducible utilizado': nn(f.base_ingreso_no_gravado),
          'Salida anticipada registrada en ERI': f.salida_eri === null ? 'sin evidencia' : nn(f.salida_eri)
        };
      }
    },
    ingreso_gravado: {
      etiqueta: 'Ingreso gravado', paso: 'Paso 10 (Excel C36)',
      formula: function (f) { return f.ingreso_gravado_formula; },
      insumos: function (f) {
        return {
          'Salida anticipada': f.salida_anticipada,
          'Saldo deducible utilizado': nn(f.base_ingreso_gravado),
          'Salida anticipada registrada en ORI': f.salida_ori === null ? 'sin evidencia' : nn(f.salida_ori)
        };
      }
    },
    pago_con_cargo_provision: {
      etiqueta: 'Pago con cargo a la provision', paso: 'Paso 11 (Excel C38, D38)',
      formula: function (f) {
        return 'SI cuando el empleado es SALIDA del anio, hubo pagos con cargo a la provision y ' +
               'existe base de impuesto diferido acumulada. Rige desde ' +
               f._anio_inicio_reversos + ' (RLRTI).';
      },
      insumos: function (f) {
        return { 'Status': f.status, 'Pagos del anio': nn(f.pagos),
                 'Base imponible del AID acumulada': nn(f.base_id_acumulada) };
      }
    },
    deduccion_adicional: {
      etiqueta: 'Deduccion adicional (reverso en CCT)', paso: 'Paso 12 (Excel C39, D39)',
      formula: function (f) { return f.deduccion_adicional_formula; },
      insumos: function (f) {
        return { 'Base imponible del AID acumulada': nn(f.base_id_acumulada),
                 'Pago efectuado en el anio': nn(f.pagos) };
      }
    },
    ori_negativo: {
      etiqueta: 'ORI negativo', paso: 'Paso 14 (Excel C42)',
      formula: function () { return 'ORI negativo = MIN(0; ORI del periodo), solo si el status es Activo, Ingreso o Jubilado.'; },
      insumos: function (f) { return { 'Status': f.status, 'ORI del periodo': nn(f.ori) }; }
    },
    saldo_2017_compensado: {
      etiqueta: 'Saldo del anio base compensado', paso: 'Paso 15 (Excel C43)',
      formula: function () { return 'Saldo compensado = Saldo por compensar del anio anterior + ORI negativo del anio'; },
      insumos: function (f) {
        return { 'Saldo por compensar del anio anterior': nn(f.por_compensar_anterior),
                 'ORI negativo del anio': nn(f.ori_negativo) };
      }
    },
    saldo_2017_por_compensar: {
      etiqueta: 'Saldo del anio base por compensar', paso: 'Paso 16 (Excel C44)',
      formula: function () { return 'Saldo por compensar = MAX(0; Saldo compensado)'; },
      insumos: function (f) { return { 'Saldo compensado': nn(f.saldo_2017_compensado) }; }
    },
    considerar_en_diferido: {
      etiqueta: 'Considerar en diferido', paso: 'Paso 17 (Excel C45)',
      formula: function () { return 'Considerar en diferido = MIN(0; Saldo compensado). Es el exceso que ya no puede compensarse.'; },
      insumos: function (f) { return { 'Saldo compensado': nn(f.saldo_2017_compensado) }; }
    },
    eri_id: {
      etiqueta: 'ERI (analisis de impuesto diferido)', paso: 'Paso 18 (Excel C47)',
      formula: function () {
        return 'ERI ID = Incremento (Costo laboral + Interes financiero) si el status es Activo, Ingreso o ' +
               'Jubilado y la regla tributaria del anio considera impuesto diferido.';
      },
      insumos: function (f) {
        return { 'Status': f.status, 'Incremento': nn(f.incremento),
                 'Considera ID': f.aplica_id ? 'SI' : 'NO', 'Regla': f.regla_id };
      }
    },
    ori_neto: {
      etiqueta: 'ORI neto', paso: 'Paso 19 (Excel C48)',
      formula: function () {
        return 'ORI neto = MAX(0; ORI del periodo) + MIN(0; Saldo del anio base compensado)';
      },
      insumos: function (f) {
        return { 'ORI del periodo': nn(f.ori), 'Saldo compensado': nn(f.saldo_2017_compensado),
                 'Status': f.status, 'Considera ID': f.aplica_id ? 'SI' : 'NO' };
      }
    },
    total_dif_temporaria: {
      etiqueta: 'Total diferencia temporaria', paso: 'Paso 20 (Excel C49)',
      formula: function () { return 'Total diferencia temporaria = ERI ID + ORI neto'; },
      insumos: function (f) { return { 'ERI ID': nn(f.eri_id), 'ORI neto': nn(f.ori_neto) }; }
    },
    id_eri: {
      etiqueta: 'Impuesto diferido ERI', paso: 'Paso 22 (Excel C61)',
      formula: function () { return 'Impuesto diferido ERI = ERI ID x Tarifa IR'; },
      insumos: function (f) {
        return { 'ERI ID': nn(f.eri_id),
                 'Tarifa IR': f.tarifa_ir === null ? 'NO CONFIGURADA' : (f.tarifa_ir * 100).toFixed(2) + '%' };
      }
    },
    id_ori: {
      etiqueta: 'Impuesto diferido ORI', paso: 'Paso 23 (Excel C62)',
      formula: function () { return 'Impuesto diferido ORI = ORI neto x Tarifa IR'; },
      insumos: function (f) {
        return { 'ORI neto': nn(f.ori_neto),
                 'Tarifa IR': f.tarifa_ir === null ? 'NO CONFIGURADA' : (f.tarifa_ir * 100).toFixed(2) + '%' };
      }
    },
    rev_aid_eri: {
      etiqueta: 'Reversion AID ERI por salida', paso: 'Paso 24 (Excel C63)',
      formula: function () { return 'Al registrarse la salida se revierte el impuesto diferido ERI acumulado del empleado.'; },
      insumos: function (f) { return { 'Status': f.status, 'Detalle': f.rev_aid_detalle }; }
    },
    rev_aid_ori: {
      etiqueta: 'Reversion AID ORI por salida', paso: 'Paso 25 (Excel C64)',
      formula: function () { return 'Al registrarse la salida se revierte el impuesto diferido ORI acumulado del empleado.'; },
      insumos: function (f) { return { 'Status': f.status, 'Detalle': f.rev_aid_detalle }; }
    },
    saldo_dif_eri: {
      etiqueta: 'Saldo diferido ERI al 31 de diciembre', paso: 'Paso 26 (Excel C65, D65)',
      formula: function (f) { return f.saldo_dif_origen; },
      insumos: function (f) {
        return { 'Impuesto diferido ERI del periodo': nn(f.id_eri), 'Reversion AID ERI': nn(f.rev_aid_eri) };
      }
    },
    saldo_dif_ori: {
      etiqueta: 'Saldo diferido ORI al 31 de diciembre', paso: 'Paso 27 (Excel C66, D66)',
      formula: function (f) { return f.saldo_dif_origen; },
      insumos: function (f) {
        return { 'Impuesto diferido ORI del periodo': nn(f.id_ori), 'Reversion AID ORI': nn(f.rev_aid_ori) };
      }
    },
    saldo_dif_activo: {
      etiqueta: 'Saldo diferido activo al 31 de diciembre', paso: 'Paso 28 (Excel C67)',
      formula: function () { return 'Saldo diferido activo = Saldo diferido ERI + Saldo diferido ORI'; },
      insumos: function (f) { return { 'Saldo diferido ERI': nn(f.saldo_dif_eri), 'Saldo diferido ORI': nn(f.saldo_dif_ori) }; }
    },
    empleado_activo_iga: {
      etiqueta: 'Empleado activo (ingreso gravado adicional)', paso: 'Paso 30 (Excel C70)',
      formula: function () { return 'SI cuando el status es Activo, Ingreso o Jubilado.'; },
      insumos: function (f) { return { 'Status': f.status }; }
    },
    ingreso_gravado_adicional: {
      etiqueta: 'Ingreso gravado adicional', paso: 'Paso 32 (Excel C72)',
      formula: function () {
        return 'Parte del ORI negativo del anio efectivamente compensada contra el saldo deducible del anio base = ' +
               'Saldo por compensar del anio anterior - Saldo por compensar del anio.';
      },
      insumos: function (f) {
        return {
          'Saldo por compensar del anio anterior': nn(f.por_compensar_anterior),
          'ORI negativo del anio': nn(f.ori_negativo),
          'Saldo por compensar del anio': nn(f.saldo_2017_por_compensar)
        };
      }
    }
  };

  /** Lista de campos con traza disponible, en orden de presentacion. */
  function camposTrazables() { return Object.keys(CAMPOS); }

  /**
   * Reconstruye la traza de un campo de una fila.
   * @returns {object} { anio, empleado, campo, paso, formula, valores, resultado, regla, fuente }
   */
  function describir(fila, campo, cfg) {
    var d = CAMPOS[campo];
    if (!d) return null;
    var ctx = Object.assign({}, fila);
    ctx._anio_inicio_reversos = cfg ? cfg.anclas.anio_inicio_reversos_pago : 2019;
    var res = fila[campo];
    return {
      anio: fila.anio,
      regimen: fila.regimen,
      empleado_id: fila.empleado_id,
      empleado: fila.nombre_original,
      campo: campo,
      etiqueta: d.etiqueta,
      paso: d.paso,
      formula: d.formula(ctx),
      valores: d.insumos(ctx),
      resultado: (res === null || res === undefined) ? 'no aplica'
                 : (typeof res === 'number' ? res.toFixed(2) : String(res)),
      regla: fila.regla_id ? (fila.regla_id + ' - ' + fila.regla_nota + ' [' + fila.regla_estado + ']') : 'no aplica',
      fuente: fila._origen
        ? [fila._origen.archivo, fila._origen.hoja, fila._origen.fila ? 'fila ' + fila._origen.fila : '']
            .filter(Boolean).join(' / ')
        : 'sin origen registrado'
    };
  }

  /** Traza completa de una fila (todos los campos), para exportacion. */
  function describirFila(fila, cfg) {
    return camposTrazables().map(function (c) { return describir(fila, c, cfg); })
      .filter(function (t) { return t !== null; });
  }

  return { CAMPOS: CAMPOS, camposTrazables: camposTrazables, describir: describir, describirFila: describirFila };
})();
