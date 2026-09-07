/* =============================================================================
 * MODULO: MOTOR DE CALCULO
 * -----------------------------------------------------------------------------
 * Implementa los 32 pasos del Excel "Proceso de Elaboracion de Anexo de JP y BD".
 * Cada campo calculado guarda la referencia al paso de origen para la pantalla
 * de trazabilidad (modulo 08-trace).
 *
 * El motor es puro: recibe datos + configuracion y devuelve un resultado.
 * No conoce el DOM ni la interfaz.
 * ========================================================================== */
var APP = window.APP;

APP.Motor = (function () {

  var VIGENTE = { ACTIVO: 1, INGRESO: 1, JUBILADO: 1 };

  function n(v) { return (v === null || v === undefined || isNaN(v)) ? 0 : Number(v); }
  function esCero(v, tol) { return Math.abs(n(v)) <= (tol || 0.005); }
  function clave(empId, reg) { return empId + '|' + reg; }

  /* ======================================================================= *
   * PASO 2 - STATUS LABORAL Y COLUMNA "CRUCE"
   * Excel C9 (reglas de status) y D9 (validacion BUSCARV contra el anio previo).
   * ======================================================================= */
  /** Normaliza cualquier variante de status a uno de los cuatro valores del Excel. */
  function normStatus(v) {
    if (!v) return null;
    if (APP.STATUS.indexOf(v) >= 0) return v;
    return APP.Loader.statusDe(v);
  }

  function determinarStatus(reg, presenciaPrevia, esUltimoAnioConDatos) {
    // 1) el archivo actuarial manda cuando trae el dato
    var declarado = normStatus(reg.status_archivo);
    if (declarado) return { status: declarado, origen: 'ARCHIVO' };

    // 2) derivacion segun el Excel, sin inventar
    if (!presenciaPrevia) return { status: 'INGRESO', origen: 'DERIVADO (no aparece en el anio anterior)' };

    // Sin marca de cesante ni de jubilado en el archivo, se asume continuidad.
    return { status: 'ACTIVO', origen: 'DERIVADO (continua respecto del anio anterior)' };
  }

  function calcularCruce(presenciaPrevia, status, esPrimerAnio) {
    // En el primer anio analizado no hay contra que cruzar: no se marca inconsistencia.
    if (esPrimerAnio) {
      return { cruce: 'PRIMER ANIO', detalle: 'Primer anio del alcance analizado: no existe anio anterior con que cruzar.' };
    }
    if (presenciaPrevia && status === 'INGRESO') {
      return { cruce: 'INCONSISTENTE', detalle: 'Marcado como INGRESO pero ya existia en el anio anterior.' };
    }
    if (!presenciaPrevia && (status === 'ACTIVO' || status === 'SALIDA' || status === 'JUBILADO')) {
      return { cruce: 'INCONSISTENTE', detalle: 'Marcado como ' + status + ' pero no existe en el anio anterior.' };
    }
    if (!presenciaPrevia) return { cruce: 'NUEVO', detalle: 'Primera aparicion en la informacion analizada.' };
    return { cruce: 'CONTINUA', detalle: 'Existe en el anio inmediato anterior.' };
  }

  /* ======================================================================= *
   * EJECUCION PRINCIPAL
   * ======================================================================= */
  /**
   * @param {object} entrada { actuariales, resumenes, contables, fusiones, overrides }
   * @param {object} cfg     configuracion vigente
   * @param {function} onProgreso  (pct, mensaje)
   * @returns {object} resultado completo
   */
  function ejecutar(entrada, cfg, onProgreso) {
    var prog = onProgreso || function () {};
    var opc = cfg.opciones;
    var tolCero = opc.tolerancia_cero;
    var overrides = entrada.overrides || {};   // ajustes manuales por (empId|reg|anio)
    var incidencias = [];                      // se convierten en alertas en el modulo 06

    prog(5, 'Homologando empleados...');

    /* --- 1. Catalogo de empleados (paso 2, celda D9) --------------------- */
    var cat = APP.Normaliza.construirCatalogo(entrada.actuariales, entrada.fusiones || {});
    var empleados = cat.empleados;
    var empPorId = {};
    empleados.forEach(function (e) { empPorId[e.empleado_id] = e; });

    /* --- 2. Indice de registros por empleado / regimen / anio ------------ */
    var idx = {};        // 'empId|reg|anio' -> registro
    var aniosSet = {};
    var sinRegimen = 0, sinAnio = 0;

    entrada.actuariales.forEach(function (r) {
      if (r.anio === null) { sinAnio++; return; }
      if (!r.regimen) { sinRegimen++; r.regimen = 'JP'; } // se reporta como incidencia
      aniosSet[r.anio] = true;
      var k = r.empleado_id + '|' + r.regimen + '|' + r.anio;
      if (idx[k]) {
        incidencias.push({
          tipo: 'REGISTRO_DUPLICADO', severidad: 'CRITICA',
          empleado_id: r.empleado_id, anio: r.anio, regimen: r.regimen,
          detalle: 'Hay mas de una fila para el mismo empleado, regimen y anio. Se usa la primera y se ignoran las demas.',
          fuente: r._origen
        });
      } else { idx[k] = r; }
    });

    if (sinAnio) {
      incidencias.push({ tipo: 'INFO_INCOMPLETA', severidad: 'CRITICA',
        detalle: sinAnio + ' fila(s) sin anio identificable fueron descartadas.' });
    }
    if (sinRegimen) {
      incidencias.push({ tipo: 'INFO_INCOMPLETA', severidad: 'ADVERTENCIA',
        detalle: sinRegimen + ' fila(s) sin regimen identificable se asignaron a JP. Verifique el mapeo de columnas.' });
    }

    var anios = Object.keys(aniosSet).map(Number).sort(function (a, b) { return a - b; });
    if (cfg.anios.inicio) anios = anios.filter(function (a) { return a >= cfg.anios.inicio; });
    if (cfg.anios.fin) anios = anios.filter(function (a) { return a <= cfg.anios.fin; });

    /* Cobertura de la informacion: primer anio y anios sin datos por regimen.
       Sirve para no confundir un vacio de alcance con la desaparicion de un empleado. */
    var cobertura = {}, primerAnioReg = {};
    entrada.actuariales.forEach(function (r) {
      if (r.anio === null || !r.regimen) return;
      cobertura[r.regimen + '|' + r.anio] = (cobertura[r.regimen + '|' + r.anio] || 0) + 1;
      if (primerAnioReg[r.regimen] === undefined || r.anio < primerAnioReg[r.regimen]) {
        primerAnioReg[r.regimen] = r.anio;
      }
    });
    ['JP', 'BD'].forEach(function (rg) {
      if (primerAnioReg[rg] === undefined) return;
      anios.forEach(function (a) {
        if (a >= primerAnioReg[rg] && !cobertura[rg + '|' + a]) {
          incidencias.push({
            tipo: 'INFO_INCOMPLETA', severidad: 'ADVERTENCIA', anio: a, regimen: rg,
            detalle: 'No se cargo informacion de ' + rg + ' para ' + a +
                     '. Los saldos de ese regimen quedan congelados en ' + (a - 1) + '.'
          });
        }
      });
    });

    /* --- 3. Indice de informacion contable ------------------------------- */
    var contPorClave = {};
    (entrada.contables || []).forEach(function (c) {
      var norm = APP.Normaliza.normalizar(c.nombre_original);
      var emp = cat.porClave[(entrada.fusiones || {})[norm] || norm];
      if (!emp || c.anio === null) return;
      var regs = c.regimen ? [c.regimen] : ['JP', 'BD'];
      regs.forEach(function (rg) {
        contPorClave[emp.empleado_id + '|' + rg + '|' + c.anio] = c;
      });
    });

    /* --- 4. Recorrido cronologico ---------------------------------------- */
    var estado = {};   // clave(empId,reg) -> acumuladores
    var filas = [];    // resultado: una fila por empleado / regimen / anio
    var anioBase = cfg.anclas.anio_base;
    var anioID = cfg.anclas.anio_inicio_id;
    var anioPago = cfg.anclas.anio_inicio_reversos_pago;

    anios.forEach(function (anio, ia) {
      prog(10 + Math.round(70 * (ia + 1) / Math.max(anios.length, 1)), 'Procesando ' + anio + '...');

      empleados.forEach(function (emp) {
        ['JP', 'BD'].forEach(function (reg) {
          var r = idx[emp.empleado_id + '|' + reg + '|' + anio];
          var k = clave(emp.empleado_id, reg);
          var st = estado[k];
          if (!st) {
            st = estado[k] = {
              saldo_deducible: 0, prev_pasivo_final: null,
              acc_id_eri: 0, acc_id_ori: 0, acc_base_id: 0,
              por_compensar: null, saldo_dif_eri: 0, saldo_dif_ori: 0,
              visto: false, ultimo_anio: null,
              saldo_deducible_anterior: 0, saldo_no_deducible_anterior: 0,
              semilla_aplicada: false, cerrado: false
            };
          }

          /* --- ausencia del empleado en el anio -------------------------- */
          if (!r) {
            // Si NADIE tiene datos de ese regimen y anio es un vacio de alcance,
            // ya reportado arriba: no se acusa al empleado de desaparecer.
            if (!cobertura[reg + '|' + anio]) return;
            if (st.visto && !st.cerrado && st.ultimo_anio === anio - 1) {
              incidencias.push({
                tipo: 'EMPLEADO_DESAPARECE', severidad: 'ADVERTENCIA',
                empleado_id: emp.empleado_id, anio: anio, regimen: reg,
                detalle: 'El empleado aparece en ' + (anio - 1) + ' y desaparece en ' + anio +
                         ' sin registrarse como SALIDA.'
              });
              st.cerrado = true;
            } else if (st.visto && st.cerrado && st.ultimo_anio < anio - 1) {
              // sin datos: nada que hacer
            }
            return;
          }
          if (st.cerrado && st.ultimo_anio !== null && st.ultimo_anio < anio - 1) {
            incidencias.push({
              tipo: 'EMPLEADO_REAPARECE', severidad: 'ADVERTENCIA',
              empleado_id: emp.empleado_id, anio: anio, regimen: reg,
              detalle: 'El empleado reaparece en ' + anio + ' tras ausentarse desde ' + st.ultimo_anio + '.'
            });
          }
          st.cerrado = false;

          var ov = overrides[emp.empleado_id + '|' + reg + '|' + anio] || {};
          var f = {};

          /* =============== IDENTIFICACION =============== */
          f.anio = anio;
          f.regimen = reg;
          f.empleado_id = emp.empleado_id;
          f.nombre_original = r.nombre_original;
          f.nombre_norm = emp.nombre_norm;
          f.cedula = r.cedula || '';
          f.sexo = r.sexo || emp.sexo || '';
          f.edad = r.edad;
          f.ts = r.ts;
          f._origen = r._origen;

          /* =============== PASO 2: STATUS Y CRUCE =============== */
          var presenciaPrevia = !!idx[emp.empleado_id + '|' + reg + '|' + (anio - 1)];
          var stt = determinarStatus(r, presenciaPrevia);
          var ovStatus = normStatus(ov.status);
          f.status = ovStatus || stt.status;
          f.status_origen = ovStatus ? 'AJUSTE MANUAL' : stt.origen;
          var cr = calcularCruce(presenciaPrevia, f.status, anio === primerAnioReg[reg]);
          f.cruce = cr.cruce;
          f.cruce_detalle = cr.detalle;
          if (f.cruce === 'INCONSISTENTE') {
            incidencias.push({
              tipo: 'CRUCE_INCONSISTENTE', severidad: 'ADVERTENCIA',
              empleado_id: emp.empleado_id, anio: anio, regimen: reg,
              detalle: cr.detalle, fuente: r._origen
            });
          }
          var vigente = !!VIGENTE[f.status];

          /* =============== PASO 4: RESUMEN UNIFICADO =============== */
          f.costo_laboral = n(r.costo_laboral);
          f.interes_financiero = n(r.interes_financiero);
          f.costo_servicios_pasados = n(r.costo_servicios_pasados);
          f.ori = n(r.ori);
          f.traspasos = n(r.traspasos);
          f.pagos = n(r.pagos);
          f.salidas_anticipadas = n(r.salidas_anticipadas);

          // Incremento = Costo laboral + Interes financiero (Excel C28 y C47)
          f.incremento = f.costo_laboral + f.interes_financiero;
          if (r.incremento_archivo !== null && Math.abs(r.incremento_archivo - f.incremento) > tolCero) {
            incidencias.push({
              tipo: 'DIF_ACTUARIAL', severidad: 'ADVERTENCIA',
              empleado_id: emp.empleado_id, anio: anio, regimen: reg,
              detalle: 'El incremento del archivo (' + r.incremento_archivo.toFixed(2) +
                       ') difiere de Costo laboral + Interes financiero (' + f.incremento.toFixed(2) + ').',
              fuente: r._origen
            });
          }

          // Pasivo inicial: el del archivo o el saldo final del anio anterior
          if (r.pasivo_inicial !== null) {
            f.pasivo_inicial = r.pasivo_inicial;
            f.pasivo_inicial_origen = 'ARCHIVO';
            if (st.prev_pasivo_final !== null && Math.abs(st.prev_pasivo_final - r.pasivo_inicial) > opc.tolerancia_conciliacion) {
              incidencias.push({
                tipo: 'INCONSISTENCIA_ENTRE_ANIOS', severidad: 'CRITICA',
                empleado_id: emp.empleado_id, anio: anio, regimen: reg,
                detalle: 'El pasivo final de ' + (anio - 1) + ' (' + st.prev_pasivo_final.toFixed(2) +
                         ') no coincide con el pasivo inicial de ' + anio + ' (' + r.pasivo_inicial.toFixed(2) + ').',
                fuente: r._origen
              });
            }
          } else {
            f.pasivo_inicial = n(st.prev_pasivo_final);
            f.pasivo_inicial_origen = st.prev_pasivo_final !== null ? 'SALDO FINAL ANIO ANTERIOR' : 'SIN DATO (0)';
          }

          // Formula de control del pasivo final
          var sg = opc.signos_pasivo_final;
          f.pasivo_final_formula =
            sg.pasivo_inicial * f.pasivo_inicial +
            sg.costo_laboral * f.costo_laboral +
            sg.interes_financiero * f.interes_financiero +
            sg.costo_servicios_pasados * f.costo_servicios_pasados +
            sg.ori * f.ori +
            sg.traspasos * f.traspasos +
            sg.pagos * f.pagos +
            sg.salidas_anticipadas * f.salidas_anticipadas;

          if (opc.pasivo_final_desde_archivo && r.pasivo_final_archivo !== null) {
            f.pasivo_final = r.pasivo_final_archivo;
            f.pasivo_final_origen = 'ARCHIVO';
          } else {
            f.pasivo_final = f.pasivo_final_formula;
            f.pasivo_final_origen = 'FORMULA';
          }
          f.dif_pasivo_final = f.pasivo_final - f.pasivo_final_formula;
          if (Math.abs(f.dif_pasivo_final) > opc.tolerancia_conciliacion) {
            incidencias.push({
              tipo: 'DIF_ACTUARIAL', severidad: 'CRITICA',
              empleado_id: emp.empleado_id, anio: anio, regimen: reg,
              detalle: 'El pasivo final del archivo (' + f.pasivo_final.toFixed(2) +
                       ') difiere de la formula de movimiento (' + f.pasivo_final_formula.toFixed(2) +
                       '). Diferencia: ' + f.dif_pasivo_final.toFixed(2) + '.',
              fuente: r._origen
            });
          }
          if (f.pasivo_final < -tolCero) {
            incidencias.push({
              tipo: 'PASIVO_NEGATIVO', severidad: 'CRITICA',
              empleado_id: emp.empleado_id, anio: anio, regimen: reg,
              detalle: 'Pasivo neto final negativo: ' + f.pasivo_final.toFixed(2) + '.',
              fuente: r._origen
            });
          }

          /* =============== PASO 5: TRATAMIENTO TRIBUTARIO =============== */
          f.ts_mayor_10 = (f.ts === null || f.ts === undefined) ? null : (f.ts >= 10);
          var fondeo = (r.fondeo_archivo !== null && r.fondeo_archivo !== undefined)
            ? r.fondeo_archivo
            : (cfg.fondeo && cfg.fondeo[anio] !== undefined ? cfg.fondeo[anio] : null);
          f.fondeo = fondeo;
          f.fondeo_origen = (r.fondeo_archivo !== null && r.fondeo_archivo !== undefined)
            ? 'ARCHIVO' : (cfg.fondeo_es_supuesto ? 'PARAMETRO (supuesto)' : 'PARAMETRO');

          var tr = APP.Reglas.evaluar(cfg, reg, anio, f.ts, fondeo);
          f.regla_id = tr.regla_id;
          f.regla_estado = tr.estado;
          f.regla_nota = tr.nota;
          f.regla_fuente = tr.fuente;
          f.deducible = tr.deducible;
          f.aplica_id = tr.aplica_id;
          f.tratamiento = tr.tratamiento;

          if (!tr.encontrada) {
            incidencias.push({
              tipo: 'REGLA_SIN_CONFIGURAR', severidad: 'CRITICA',
              empleado_id: emp.empleado_id, anio: anio, regimen: reg,
              detalle: tr.nota, fuente: r._origen
            });
          } else if (tr.estado === 'PENDIENTE_CONSULTA') {
            incidencias.push({
              tipo: 'REGLA_PENDIENTE_CONSULTA', severidad: 'INFORMATIVA',
              empleado_id: emp.empleado_id, anio: anio, regimen: reg,
              detalle: 'Regla ' + tr.regla_id + ': ' + tr.nota
            });
          }
          if (reg === 'JP' && anio === 2021 && cfg.fondeo_es_supuesto && r.fondeo_archivo === null) {
            incidencias.push({
              tipo: 'SUPUESTO_APLICADO', severidad: 'INFORMATIVA',
              empleado_id: emp.empleado_id, anio: anio, regimen: reg,
              detalle: 'JP 2021: se aplico el supuesto por defecto de fondeo = ' + (fondeo ? 'SI' : 'NO') +
                       '. Confirme el dato en Parametros.'
            });
          }
          if (f.ts === null || f.ts === undefined) {
            incidencias.push({
              tipo: 'INFO_INCOMPLETA', severidad: 'ADVERTENCIA',
              empleado_id: emp.empleado_id, anio: anio, regimen: reg,
              detalle: 'Sin tiempo de servicio: no se puede aplicar la regla por TS.',
              fuente: r._origen
            });
          }

          /* =============== PASO 6: MOVIMIENTO DE VALORES DEDUCIBLES ======= */
          // ERI = incremento (Costo laboral + Interes financiero) si el anio es deducible (C28)
          f.mov_eri = (f.deducible === true) ? f.incremento : 0;
          // ORI = ORI del periodo si el anio es deducible (C29)
          f.mov_ori = (f.deducible === true) ? f.ori : 0;

          f.saldo_deducible_anterior = st.saldo_deducible;
          f.saldo_deducible = st.saldo_deducible + f.mov_eri + f.mov_ori;               // C30
          f.saldo_no_deducible = Math.max(0, f.pasivo_final - f.saldo_deducible);        // C31
          f.saldo_no_deducible_anterior = st.saldo_no_deducible_anterior;

          /* =============== PASO 7: SALIDA ANTICIPADA =============== */
          f.salida_anticipada = (f.status === 'SALIDA' &&
                                 esCero(f.pasivo_final, tolCero) &&
                                 !esCero(f.salidas_anticipadas, tolCero)) ? 'SI' : 'NO';
          f.salida_anticipada_detalle =
            'Status=' + f.status + '; Pasivo final=' + f.pasivo_final.toFixed(2) +
            '; Salidas anticipadas=' + f.salidas_anticipadas.toFixed(2);

          if (f.status === 'SALIDA' && !esCero(f.pasivo_final, opc.tolerancia_conciliacion)) {
            incidencias.push({
              tipo: 'SALIDA_PASIVO_NO_CERO', severidad: 'CRITICA',
              empleado_id: emp.empleado_id, anio: anio, regimen: reg,
              detalle: 'Empleado con status SALIDA y pasivo final ' + f.pasivo_final.toFixed(2) + ' (deberia ser 0).',
              fuente: r._origen
            });
          }
          if (f.status === 'SALIDA' && esCero(f.pagos, tolCero) && esCero(f.salidas_anticipadas, tolCero)) {
            incidencias.push({
              tipo: 'SALIDA_SIN_PAGO', severidad: 'ADVERTENCIA',
              empleado_id: emp.empleado_id, anio: anio, regimen: reg,
              detalle: 'Empleado con status SALIDA sin pagos ni salidas anticipadas registradas.',
              fuente: r._origen
            });
          }

          /* =============== PASO 8: CLASIFICACION ERI / ORI DE LA SALIDA === */
          var cont = contPorClave[emp.empleado_id + '|' + reg + '|' + anio];
          var eri = ov.salida_eri !== undefined ? ov.salida_eri
                  : (r.salida_eri_archivo !== null ? r.salida_eri_archivo
                  : (cont && cont.salida_eri !== null ? cont.salida_eri : null));
          var ori_s = ov.salida_ori !== undefined ? ov.salida_ori
                    : (r.salida_ori_archivo !== null ? r.salida_ori_archivo
                    : (cont && cont.salida_ori !== null ? cont.salida_ori : null));

          // Clasificacion cualitativa (ERI u ORI) sin importe explicito
          var clasif = ov.clasificacion_pg || r.clasificacion_pg_archivo ||
                       (cont ? cont.clasificacion_pg : null) ||
                       (cfg.clasificacion_pg_actuarial ? cfg.clasificacion_pg_actuarial[anio] : null) || null;

          if (f.salida_anticipada === 'SI' && eri === null && ori_s === null && clasif) {
            // hay clasificacion cualitativa: se asigna el importe total de la salida a ese rubro
            if (clasif === 'ERI') eri = f.salidas_anticipadas;
            if (clasif === 'ORI') ori_s = f.salidas_anticipadas;
          }

          f.salida_eri = eri;
          f.salida_ori = ori_s;
          f.clasificacion_pg = clasif;
          f.clasificacion_fuente = ov.salida_eri !== undefined || ov.salida_ori !== undefined ? 'AJUSTE MANUAL'
            : (r.salida_eri_archivo !== null || r.salida_ori_archivo !== null) ? 'ARCHIVO ACTUARIAL'
            : cont ? ('CONTABLE: ' + (cont._origen.archivo || '') + (cont.observacion ? ' - ' + cont.observacion : ''))
            : clasif ? 'PARAMETRO POR ANIO' : 'SIN EVIDENCIA';

          if (f.salida_anticipada === 'SI' && eri === null && ori_s === null) {
            f.clasificacion_estado = 'REVISION MANUAL';
            incidencias.push({
              tipo: 'ORI_SIN_CLASIFICACION', severidad: 'CRITICA',
              empleado_id: emp.empleado_id, anio: anio, regimen: reg,
              detalle: 'Salida anticipada sin evidencia de si afecto ERI u ORI. ' +
                       'Cargue el mayor contable o el informe de auditoria, o registre el ajuste manual.',
              fuente: r._origen
            });
          } else {
            f.clasificacion_estado = f.salida_anticipada === 'SI' ? 'CLASIFICADA' : 'NO APLICA';
          }

          /* =============== PASOS 9 y 10: INGRESO NO GRAVADO / GRAVADO ===== */
          var usarAnterior = opc.base_saldos_salida === 'ANIO_ANTERIOR';
          var baseNoDed = usarAnterior ? st.saldo_no_deducible_anterior : f.saldo_no_deducible;
          var baseDed = usarAnterior ? st.saldo_deducible : f.saldo_deducible;
          f.base_ingreso_no_gravado = baseNoDed;
          f.base_ingreso_gravado = baseDed;

          // Paso 9 (C35): salida anticipada + reverso contra ERI
          f.ingreso_no_gravado = (f.salida_anticipada === 'SI' && eri !== null && !esCero(eri, tolCero))
            ? Math.min(baseNoDed, Math.abs(eri)) : 0;
          f.ingreso_no_gravado_formula = f.ingreso_no_gravado
            ? 'MIN(Saldo no deducible ' + (usarAnterior ? anio - 1 : anio) + ' = ' + baseNoDed.toFixed(2) +
              '; Salida anticipada ERI = ' + Math.abs(n(eri)).toFixed(2) + ')'
            : 'No aplica';

          // Paso 10 (C36): salida anticipada + reverso contra ORI
          f.ingreso_gravado = (f.salida_anticipada === 'SI' && ori_s !== null && !esCero(ori_s, tolCero))
            ? Math.min(baseDed, Math.abs(ori_s)) : 0;
          f.ingreso_gravado_formula = f.ingreso_gravado
            ? 'MIN(Saldo deducible ' + (usarAnterior ? anio - 1 : anio) + ' = ' + baseDed.toFixed(2) +
              '; Salida anticipada ORI = ' + Math.abs(n(ori_s)).toFixed(2) + ')'
            : 'No aplica';

          /* =============== PASOS 13 a 17: ANALISIS ORI NEGATIVO =========== */
          // Semilla: saldo del anio base (31-12-2017), solo empleados vigentes (C41)
          if (anio === anioID && !st.semilla_aplicada) {
            var semilla = 0, origenSemilla = 'SIN DATO (0)';
            if (ov.saldo_anio_base !== undefined) {
              semilla = n(ov.saldo_anio_base); origenSemilla = 'AJUSTE MANUAL';
            } else if (st.ultimo_anio !== null && st.ultimo_anio >= anioBase) {
              semilla = opc.origen_saldo_anio_base === 'SALDO_NO_DEDUCIBLE'
                ? st.saldo_no_deducible_anterior : st.saldo_deducible;
              origenSemilla = 'CALCULADO AL 31-12-' + anioBase;
            } else {
              incidencias.push({
                tipo: 'INFO_INCOMPLETA', severidad: 'ADVERTENCIA',
                empleado_id: emp.empleado_id, anio: anio, regimen: reg,
                detalle: 'No se cargo informacion de ' + anioBase + ': el saldo inicial del analisis de ' +
                         'ORI negativo e ingreso gravado adicional se tomo como 0.'
              });
            }
            st.por_compensar = vigente ? semilla : 0;
            st.semilla_aplicada = true;
            f.saldo_anio_base = semilla;
            f.saldo_anio_base_origen = origenSemilla;
          }

          if (anio >= anioID) {
            f.por_compensar_anterior = n(st.por_compensar);
            f.ori_negativo = vigente ? Math.min(0, f.ori) : 0;                        // paso 14 (C42)
            if (vigente) {
              f.saldo_2017_compensado = f.por_compensar_anterior + f.ori_negativo;    // paso 15 (C43)
              f.saldo_2017_por_compensar = Math.max(0, f.saldo_2017_compensado);      // paso 16 (C44)
              f.considerar_en_diferido = Math.min(0, f.saldo_2017_compensado);        // paso 17 (C45)
              // Paso 32 (C72): parte del ORI negativo efectivamente compensada
              f.ingreso_gravado_adicional = f.por_compensar_anterior - f.saldo_2017_por_compensar;
              st.por_compensar = f.saldo_2017_por_compensar;
            } else {
              f.saldo_2017_compensado = null;
              f.saldo_2017_por_compensar = f.por_compensar_anterior;
              f.considerar_en_diferido = 0;
              f.ingreso_gravado_adicional = 0;
            }
            f.empleado_activo_iga = vigente ? 'SI' : 'NO';                            // paso 30 (C70)
          } else {
            f.por_compensar_anterior = null;
            f.ori_negativo = null;
            f.saldo_2017_compensado = null;
            f.saldo_2017_por_compensar = null;
            f.considerar_en_diferido = null;
            f.ingreso_gravado_adicional = null;
            f.empleado_activo_iga = '';
          }

          /* =============== PASOS 18 a 28: IMPUESTOS DIFERIDOS ============= */
          if (anio >= anioID) {
            // Paso 18 (C47): ERI = incremento si el empleado esta vigente
            f.eri_id = (vigente && f.aplica_id === true) ? f.incremento : 0;
            // Paso 19 (C48): ORI neto = ORI positivo + saldo 2017 compensado negativo
            f.ori_neto = (vigente && f.aplica_id === true)
              ? (Math.max(0, f.ori) + Math.min(0, n(f.saldo_2017_compensado))) : 0;
            // Paso 20 (C49)
            f.total_dif_temporaria = f.eri_id + f.ori_neto;

            // Paso 21 (C60): tarifa de Impuesto a la Renta
            var tarifa = cfg.tarifas_ir ? cfg.tarifas_ir[anio] : undefined;
            if (tarifa === undefined || tarifa === null || tarifa === '') {
              f.tarifa_ir = null;
              f.tarifa_ir_estado = 'NO CONFIGURADA';
              if (Math.abs(f.total_dif_temporaria) > tolCero) {
                incidencias.push({
                  tipo: 'TARIFA_IR_INEXISTENTE', severidad: 'CRITICA',
                  empleado_id: emp.empleado_id, anio: anio, regimen: reg,
                  detalle: 'No hay tarifa de Impuesto a la Renta configurada para ' + anio +
                           '. El impuesto diferido de este registro quedo en 0.'
                });
              }
            } else {
              f.tarifa_ir = Number(tarifa);
              f.tarifa_ir_estado = 'OK';
            }
            var t = n(f.tarifa_ir);

            f.id_eri = f.eri_id * t;          // paso 22 (C61)
            f.id_ori = f.ori_neto * t;        // paso 23 (C62)

            // Paso 24 y 25 (C63/C64): reversion al momento de la salida
            var signo = opc.signo_reversion_aid === 'POSITIVO' ? 1 : -1;
            if (f.status === 'SALIDA') {
              f.rev_aid_eri = signo * st.acc_id_eri;
              f.rev_aid_ori = signo * st.acc_id_ori;
              f.rev_aid_detalle = 'Impuesto diferido acumulado hasta ' + anio +
                                  ': ERI ' + st.acc_id_eri.toFixed(2) + ', ORI ' + st.acc_id_ori.toFixed(2) + '.';
            } else {
              f.rev_aid_eri = 0; f.rev_aid_ori = 0; f.rev_aid_detalle = 'No aplica';
            }

            var aporteRev = opc.signo_reversion_aid === 'POSITIVO' ? -1 : 1;

            // Paso 26 y 27 (C65/C66 y D65/D66)
            if (anio === anioID) {
              f.saldo_dif_eri = f.id_eri;
              f.saldo_dif_ori = f.id_ori;
              f.saldo_dif_origen = 'PRIMER ANIO: solo el impuesto diferido del periodo';
            } else {
              f.saldo_dif_eri = st.saldo_dif_eri + f.id_eri + aporteRev * f.rev_aid_eri;
              f.saldo_dif_ori = st.saldo_dif_ori + f.id_ori + aporteRev * f.rev_aid_ori;
              f.saldo_dif_origen = 'Saldo anterior + ID del periodo ' +
                                   (opc.signo_reversion_aid === 'POSITIVO' ? '- ' : '+ ') + 'reversion';
            }
            f.saldo_dif_activo = f.saldo_dif_eri + f.saldo_dif_ori;   // paso 28 (C67)

            /* --- Pasos 11 y 12: pago con cargo a la provision ------------ */
            f.base_id_acumulada = st.acc_base_id;
            if (anio >= anioPago && f.status === 'SALIDA' && !esCero(f.pagos, tolCero) && st.acc_base_id > tolCero) {
              f.pago_con_cargo_provision = 'SI';
              f.deduccion_adicional = Math.min(st.acc_base_id, Math.abs(f.pagos));   // C39
              f.deduccion_adicional_formula =
                'MIN(Base imponible del AID acumulada = ' + st.acc_base_id.toFixed(2) +
                '; Pago del anio = ' + Math.abs(f.pagos).toFixed(2) + ')';
            } else {
              f.pago_con_cargo_provision = 'NO';
              f.deduccion_adicional = 0;
              f.deduccion_adicional_formula = anio < anioPago
                ? 'No aplica: el uso del ID por pagos rige desde ' + anioPago + ' (RLRTI)'
                : 'No aplica';
            }

            // acumuladores para los anios siguientes
            st.acc_id_eri += f.id_eri;
            st.acc_id_ori += f.id_ori;
            st.acc_base_id += f.total_dif_temporaria;
            if (f.status === 'SALIDA') { st.acc_id_eri = 0; st.acc_id_ori = 0; st.acc_base_id = 0; }
            st.saldo_dif_eri = f.saldo_dif_eri;
            st.saldo_dif_ori = f.saldo_dif_ori;
          } else {
            f.eri_id = null; f.ori_neto = null; f.total_dif_temporaria = null;
            f.tarifa_ir = null; f.tarifa_ir_estado = 'NO APLICA';
            f.id_eri = null; f.id_ori = null;
            f.rev_aid_eri = null; f.rev_aid_ori = null; f.rev_aid_detalle = '';
            f.saldo_dif_eri = null; f.saldo_dif_ori = null; f.saldo_dif_activo = null;
            f.base_id_acumulada = null;
            f.pago_con_cargo_provision = ''; f.deduccion_adicional = null;
            f.deduccion_adicional_formula = 'El analisis de ID inicia en ' + anioID;
          }

          /* --- cierre del anio para este empleado / regimen -------------- */
          st.saldo_no_deducible_anterior = f.saldo_no_deducible;
          st.saldo_deducible = f.saldo_deducible;
          st.prev_pasivo_final = f.pasivo_final;
          st.visto = true;
          st.ultimo_anio = anio;
          if (f.status === 'SALIDA') { st.cerrado = true; }

          filas.push(f);
        });
      });
    });

    prog(85, 'Consolidando resultados...');

    /* --- 5. Indice de acceso rapido a las filas -------------------------- */
    var filaPorClave = {};
    filas.forEach(function (f) { filaPorClave[f.empleado_id + '|' + f.regimen + '|' + f.anio] = f; });

    return {
      generado: new Date().toISOString(),
      config: cfg,
      anios: anios,
      empleados: empleados,
      filas: filas,
      filaPorClave: filaPorClave,
      incidencias: incidencias,
      duplicados: APP.Normaliza.detectarDuplicados(empleados, opc.umbral_similitud_nombres),
      variaciones: APP.Normaliza.variacionesDeNombre(empleados)
    };
  }

  return {
    ejecutar: ejecutar,
    determinarStatus: determinarStatus,
    calcularCruce: calcularCruce
  };
})();
