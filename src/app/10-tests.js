/* =============================================================================
 * MODULO: CASOS DE PRUEBA
 * -----------------------------------------------------------------------------
 * Prompt seccion 32: casos de prueba con comparacion "resultado esperado vs
 * resultado calculado". Se ejecutan sobre datos sinteticos, dentro de la propia
 * aplicacion, sin tocar la informacion del usuario.
 * ========================================================================== */
var APP = window.APP;

APP.Pruebas = (function () {

  /* --- Constructor de registros actuariales sinteticos ------------------- */
  function reg(o) {
    return {
      _origen: { archivo: 'PRUEBA', hoja: 'sintetica', fila: o._fila || 0 },
      anio: o.anio, regimen: o.regimen || 'JP',
      nombre_original: o.nombre, cedula: o.cedula || '', sexo: o.sexo || '',
      edad: o.edad === undefined ? 40 : o.edad,
      ts: o.ts === undefined ? null : o.ts,
      status_archivo: o.status || null,
      pasivo_inicial: o.pi === undefined ? null : o.pi,
      costo_laboral: o.cl === undefined ? 0 : o.cl,
      interes_financiero: o.iff === undefined ? 0 : o.iff,
      incremento_archivo: o.inc === undefined ? null : o.inc,
      costo_servicios_pasados: o.csp === undefined ? 0 : o.csp,
      ori: o.ori === undefined ? 0 : o.ori,
      salidas_anticipadas: o.sa === undefined ? 0 : o.sa,
      traspasos: o.tr === undefined ? 0 : o.tr,
      pagos: o.pg === undefined ? 0 : o.pg,
      pasivo_final_archivo: o.pf === undefined ? null : o.pf,
      fondeo_archivo: o.fondeo === undefined ? null : o.fondeo,
      salida_eri_archivo: o.seri === undefined ? null : o.seri,
      salida_ori_archivo: o.sori === undefined ? null : o.sori,
      clasificacion_pg_archivo: o.clasif || null
    };
  }

  function cfgPrueba() {
    var c = APP.configDefault();
    c.tarifas_ir = { 2017: 0.25, 2018: 0.25, 2019: 0.25, 2020: 0.25, 2021: 0.25, 2022: 0.25, 2023: 0.25 };
    c.fondeo = { 2021: false };
    return c;
  }

  function correr(actuariales, cfg, contables) {
    return APP.Motor.ejecutar(
      { actuariales: actuariales, resumenes: [], contables: contables || [], fusiones: {}, overrides: {} },
      cfg || cfgPrueba(),
      function () {}
    );
  }

  function fila(res, nombreNorm, reg_, anio) {
    return res.filas.filter(function (f) {
      return f.nombre_norm === nombreNorm && f.regimen === reg_ && f.anio === anio;
    })[0];
  }

  function tieneAlerta(res, tipo) {
    return (res.incidencias || []).some(function (i) { return i.tipo === tipo; });
  }

  function aprox(a, b, tol) {
    if (a === null || a === undefined) return b === null || b === undefined;
    return Math.abs(Number(a) - Number(b)) <= (tol === undefined ? 0.01 : tol);
  }

  /* ======================================================================= *
   * DEFINICION DE LOS CASOS
   * ======================================================================= */
  var CASOS = [

    /* --- 1. Empleado nuevo ---------------------------------------------- */
    { id: 1, nombre: 'Empleado nuevo (primera aparicion)',
      descripcion: 'Un empleado que aparece por primera vez en 2019 debe quedar como INGRESO con cruce NUEVO.',
      correr: function () {
        var res = correr([
          reg({ anio: 2018, nombre: 'ANA TORRES', ts: 5, cl: 100, iff: 10, pi: 0, pf: 110 }),
          reg({ anio: 2019, nombre: 'ANA TORRES', ts: 6, cl: 110, iff: 12, pi: 110, pf: 232 }),
          reg({ anio: 2019, nombre: 'LUIS MORA', ts: 1, cl: 50, iff: 0, pi: 0, pf: 50 })
        ]);
        var f = fila(res, 'LUIS MORA', 'JP', 2019);
        return [
          { concepto: 'Status', esperado: 'INGRESO', obtenido: f.status },
          { concepto: 'Cruce', esperado: 'NUEVO', obtenido: f.cruce }
        ];
      } },

    /* --- 2. Empleado activo --------------------------------------------- */
    { id: 2, nombre: 'Empleado activo entre anios',
      descripcion: 'Un empleado presente en dos anios consecutivos debe quedar ACTIVO con cruce CONTINUA.',
      correr: function () {
        var res = correr([
          reg({ anio: 2018, nombre: 'ANA TORRES', ts: 5, cl: 100, iff: 10, pi: 0, pf: 110 }),
          reg({ anio: 2019, nombre: 'ANA TORRES', ts: 6, cl: 110, iff: 12, pi: 110, pf: 232 })
        ]);
        var f = fila(res, 'ANA TORRES', 'JP', 2019);
        return [
          { concepto: 'Status', esperado: 'ACTIVO', obtenido: f.status },
          { concepto: 'Cruce', esperado: 'CONTINUA', obtenido: f.cruce },
          { concepto: 'Incremento (CL + IF)', esperado: 122, obtenido: f.incremento }
        ];
      } },

    /* --- 3. Empleado jubilado -------------------------------------------- */
    { id: 3, nombre: 'Empleado jubilado',
      descripcion: 'El jubilado es un status vigente: entra al analisis de impuesto diferido y de ORI negativo.',
      correr: function () {
        var res = correr([
          reg({ anio: 2018, nombre: 'PEDRO RUIZ', ts: 25, cl: 200, iff: 40, pi: 1000, pf: 1240, status: 'Jubilado' })
        ]);
        var f = fila(res, 'PEDRO RUIZ', 'JP', 2018);
        return [
          { concepto: 'Status', esperado: 'JUBILADO', obtenido: f.status },
          { concepto: 'ERI ID = incremento', esperado: 240, obtenido: f.eri_id },
          { concepto: 'Impuesto diferido ERI (25%)', esperado: 60, obtenido: f.id_eri }
        ];
      } },

    /* --- 4. Empleado que sale -------------------------------------------- */
    { id: 4, nombre: 'Empleado que sale',
      descripcion: 'Con status SALIDA el empleado deja de ser vigente: ERI ID y ORI neto quedan en cero.',
      correr: function () {
        var res = correr([
          reg({ anio: 2018, nombre: 'ROSA DIAZ', ts: 12, cl: 100, iff: 20, pi: 500, pf: 620 }),
          reg({ anio: 2019, nombre: 'ROSA DIAZ', ts: 13, pi: 620, pg: 620, pf: 0, status: 'Salida' })
        ]);
        var f = fila(res, 'ROSA DIAZ', 'JP', 2019);
        return [
          { concepto: 'Status', esperado: 'SALIDA', obtenido: f.status },
          { concepto: 'ERI ID', esperado: 0, obtenido: f.eri_id },
          { concepto: 'ORI neto', esperado: 0, obtenido: f.ori_neto },
          { concepto: 'Pasivo final', esperado: 0, obtenido: f.pasivo_final }
        ];
      } },

    /* --- 5. TS menor a 10 anios ------------------------------------------ */
    { id: 5, nombre: 'JP hasta 2017 con TS menor a 10 anios',
      descripcion: 'Regla JP-02: gasto no deducible. El saldo deducible se mantiene en cero.',
      correr: function () {
        var res = correr([
          reg({ anio: 2017, nombre: 'CARLA VEGA', ts: 4, cl: 300, iff: 50, pi: 1000, pf: 1350 })
        ]);
        var f = fila(res, 'CARLA VEGA', 'JP', 2017);
        return [
          { concepto: 'Regla aplicada', esperado: 'JP-02', obtenido: f.regla_id },
          { concepto: 'Deducible', esperado: false, obtenido: f.deducible },
          { concepto: 'ERI movimiento', esperado: 0, obtenido: f.mov_eri },
          { concepto: 'Saldo deducible', esperado: 0, obtenido: f.saldo_deducible },
          { concepto: 'Saldo no deducible', esperado: 1350, obtenido: f.saldo_no_deducible }
        ];
      } },

    /* --- 6. TS mayor o igual a 10 anios ---------------------------------- */
    { id: 6, nombre: 'JP hasta 2017 con TS mayor o igual a 10 anios',
      descripcion: 'Regla JP-01: gasto deducible. El saldo deducible acumula el incremento.',
      correr: function () {
        var res = correr([
          reg({ anio: 2017, nombre: 'JUAN PEREZ', ts: 12, cl: 1000, iff: 200, pi: 5000, pf: 6200 })
        ]);
        var f = fila(res, 'JUAN PEREZ', 'JP', 2017);
        return [
          { concepto: 'Regla aplicada', esperado: 'JP-01', obtenido: f.regla_id },
          { concepto: 'Deducible', esperado: true, obtenido: f.deducible },
          { concepto: 'ERI movimiento', esperado: 1200, obtenido: f.mov_eri },
          { concepto: 'Saldo deducible', esperado: 1200, obtenido: f.saldo_deducible },
          { concepto: 'Saldo no deducible', esperado: 5000, obtenido: f.saldo_no_deducible }
        ];
      } },

    /* --- 7. Salida anticipada -------------------------------------------- */
    { id: 7, nombre: 'Salida anticipada con reverso contra ERI',
      descripcion: 'Status SALIDA + pasivo final 0 + importe en salidas anticipadas. ' +
                   'Ingreso no gravado = MIN(saldo no deducible del anio anterior; salida ERI).',
      correr: function () {
        var res = correr([
          reg({ anio: 2017, nombre: 'MARIO SILVA', ts: 12, cl: 1000, iff: 200, pi: 5000, pf: 6200 }),
          reg({ anio: 2018, nombre: 'MARIO SILVA', ts: 13, pi: 6200, sa: 6200, pf: 0, status: 'Salida', seri: 6200 })
        ]);
        var f = fila(res, 'MARIO SILVA', 'JP', 2018);
        return [
          { concepto: 'Salida anticipada', esperado: 'SI', obtenido: f.salida_anticipada },
          { concepto: 'Saldo no deducible 2017 (base)', esperado: 5000, obtenido: f.base_ingreso_no_gravado },
          { concepto: 'Ingreso no gravado', esperado: 5000, obtenido: f.ingreso_no_gravado },
          { concepto: 'Estado de la clasificacion', esperado: 'CLASIFICADA', obtenido: f.clasificacion_estado }
        ];
      } },

    /* --- 7b. Salida anticipada sin evidencia ----------------------------- */
    { id: 8, nombre: 'Salida anticipada sin evidencia contable',
      descripcion: 'Sin mayor contable no se asume clasificacion: el estado queda en REVISION MANUAL.',
      correr: function () {
        var res = correr([
          reg({ anio: 2017, nombre: 'ELSA PAZ', ts: 12, cl: 500, iff: 100, pi: 2000, pf: 2600 }),
          reg({ anio: 2018, nombre: 'ELSA PAZ', ts: 13, pi: 2600, sa: 2600, pf: 0, status: 'Salida' })
        ]);
        var f = fila(res, 'ELSA PAZ', 'JP', 2018);
        return [
          { concepto: 'Salida anticipada', esperado: 'SI', obtenido: f.salida_anticipada },
          { concepto: 'Estado de la clasificacion', esperado: 'REVISION MANUAL', obtenido: f.clasificacion_estado },
          { concepto: 'Ingreso gravado', esperado: 0, obtenido: f.ingreso_gravado },
          { concepto: 'Ingreso no gravado', esperado: 0, obtenido: f.ingreso_no_gravado },
          { concepto: 'Alerta ORI_SIN_CLASIFICACION', esperado: true, obtenido: tieneAlerta(res, 'ORI_SIN_CLASIFICACION') }
        ];
      } },

    /* --- 9. ORI positivo -------------------------------------------------- */
    { id: 9, nombre: 'ORI positivo en el analisis de impuesto diferido',
      descripcion: 'ORI neto = MAX(0; ORI) + MIN(0; saldo compensado). Con ORI positivo y saldo por compensar ' +
                   'sin agotar, el ORI neto es el ORI del periodo.',
      correr: function () {
        var res = correr([
          reg({ anio: 2017, nombre: 'JUAN PEREZ', ts: 12, cl: 1000, iff: 200, pi: 5000, pf: 6200 }),
          reg({ anio: 2018, nombre: 'JUAN PEREZ', ts: 13, cl: 1100, iff: 220, ori: 300, pi: 6200, pf: 7820 })
        ]);
        var f = fila(res, 'JUAN PEREZ', 'JP', 2018);
        return [
          { concepto: 'Regla aplicada', esperado: 'JP-03', obtenido: f.regla_id },
          { concepto: 'ERI ID (incremento)', esperado: 1320, obtenido: f.eri_id },
          { concepto: 'ORI neto', esperado: 300, obtenido: f.ori_neto },
          { concepto: 'Total diferencia temporaria', esperado: 1620, obtenido: f.total_dif_temporaria },
          { concepto: 'Impuesto diferido ERI (25%)', esperado: 330, obtenido: f.id_eri },
          { concepto: 'Impuesto diferido ORI (25%)', esperado: 75, obtenido: f.id_ori },
          { concepto: 'Saldo diferido activo', esperado: 405, obtenido: f.saldo_dif_activo }
        ];
      } },

    /* --- 10. ORI negativo ------------------------------------------------- */
    { id: 10, nombre: 'ORI negativo compensado contra el saldo del anio base',
      descripcion: 'Saldo deducible al 31-12-2017 = 1.200. En 2018 el ORI es -400: se compensa 400 y quedan 800 ' +
                   'por compensar. El ingreso gravado adicional es 400.',
      correr: function () {
        var res = correr([
          reg({ anio: 2017, nombre: 'JUAN PEREZ', ts: 12, cl: 1000, iff: 200, pi: 5000, pf: 6200 }),
          reg({ anio: 2018, nombre: 'JUAN PEREZ', ts: 13, cl: 0, iff: 0, ori: -400, pi: 6200, pf: 5800 })
        ]);
        var f = fila(res, 'JUAN PEREZ', 'JP', 2018);
        return [
          { concepto: 'Saldo por compensar (anio anterior)', esperado: 1200, obtenido: f.por_compensar_anterior },
          { concepto: 'ORI negativo', esperado: -400, obtenido: f.ori_negativo },
          { concepto: 'Saldo compensado', esperado: 800, obtenido: f.saldo_2017_compensado },
          { concepto: 'Saldo por compensar', esperado: 800, obtenido: f.saldo_2017_por_compensar },
          { concepto: 'Considerar en diferido', esperado: 0, obtenido: f.considerar_en_diferido },
          { concepto: 'Ingreso gravado adicional', esperado: 400, obtenido: f.ingreso_gravado_adicional }
        ];
      } },

    /* --- 11. ORI negativo que excede el saldo del anio base -------------- */
    { id: 11, nombre: 'ORI negativo que agota el saldo del anio base',
      descripcion: 'El exceso pasa a "considerar en diferido" y reduce el ORI neto del analisis de ID.',
      correr: function () {
        var res = correr([
          reg({ anio: 2017, nombre: 'JUAN PEREZ', ts: 12, cl: 1000, iff: 200, pi: 5000, pf: 6200 }),
          reg({ anio: 2018, nombre: 'JUAN PEREZ', ts: 13, cl: 0, iff: 0, ori: -2000, pi: 6200, pf: 4200 })
        ]);
        var f = fila(res, 'JUAN PEREZ', 'JP', 2018);
        return [
          { concepto: 'Saldo compensado', esperado: -800, obtenido: f.saldo_2017_compensado },
          { concepto: 'Saldo por compensar', esperado: 0, obtenido: f.saldo_2017_por_compensar },
          { concepto: 'Considerar en diferido', esperado: -800, obtenido: f.considerar_en_diferido },
          { concepto: 'Ingreso gravado adicional', esperado: 1200, obtenido: f.ingreso_gravado_adicional },
          { concepto: 'ORI neto', esperado: -800, obtenido: f.ori_neto },
          { concepto: 'Impuesto diferido ORI (25%)', esperado: -200, obtenido: f.id_ori }
        ];
      } },

    /* --- 12. Pago con impuesto diferido y reversion ---------------------- */
    { id: 12, nombre: 'Pago con impuesto diferido y reversion del AID',
      descripcion: 'El empleado acumula ID en 2018 y sale en 2019 con pago. Se revierte el AID acumulado y ' +
                   'se reconoce la deduccion adicional = MIN(base AID acumulada; pago del anio).',
      correr: function () {
        var res = correr([
          reg({ anio: 2017, nombre: 'JUAN PEREZ', ts: 12, cl: 1000, iff: 200, pi: 5000, pf: 6200 }),
          reg({ anio: 2018, nombre: 'JUAN PEREZ', ts: 13, cl: 1100, iff: 220, ori: 300, pi: 6200, pf: 7820 }),
          reg({ anio: 2019, nombre: 'JUAN PEREZ', ts: 14, pi: 7820, pg: 7820, pf: 0, status: 'Salida' })
        ]);
        var f = fila(res, 'JUAN PEREZ', 'JP', 2019);
        return [
          { concepto: 'Reversion AID ERI', esperado: -330, obtenido: f.rev_aid_eri },
          { concepto: 'Reversion AID ORI', esperado: -75, obtenido: f.rev_aid_ori },
          { concepto: 'Saldo diferido ERI', esperado: 0, obtenido: f.saldo_dif_eri },
          { concepto: 'Saldo diferido ORI', esperado: 0, obtenido: f.saldo_dif_ori },
          { concepto: 'Saldo diferido activo', esperado: 0, obtenido: f.saldo_dif_activo },
          { concepto: 'Pago con cargo a la provision', esperado: 'SI', obtenido: f.pago_con_cargo_provision },
          { concepto: 'Base AID acumulada', esperado: 1620, obtenido: f.base_id_acumulada },
          { concepto: 'Deduccion adicional', esperado: 1620, obtenido: f.deduccion_adicional }
        ];
      } },

    /* --- 13. Diferencia actuarial ---------------------------------------- */
    { id: 13, nombre: 'Diferencia contra el informe actuarial',
      descripcion: 'El pasivo final declarado no cuadra con la formula de movimiento: se emite alerta CRITICA.',
      correr: function () {
        var res = correr([
          reg({ anio: 2018, nombre: 'INES CRUZ', ts: 12, cl: 100, iff: 20, pi: 1000, pf: 1500 })
        ]);
        var f = fila(res, 'INES CRUZ', 'JP', 2018);
        return [
          { concepto: 'Pasivo final (formula)', esperado: 1120, obtenido: f.pasivo_final_formula },
          { concepto: 'Pasivo final (archivo)', esperado: 1500, obtenido: f.pasivo_final },
          { concepto: 'Diferencia', esperado: 380, obtenido: f.dif_pasivo_final },
          { concepto: 'Alerta DIF_ACTUARIAL', esperado: true, obtenido: tieneAlerta(res, 'DIF_ACTUARIAL') }
        ];
      } },

    /* --- 14. Duplicidad de empleado -------------------------------------- */
    { id: 14, nombre: 'Duplicidad de empleado',
      descripcion: 'Dos nombres con las mismas palabras en distinto orden se proponen como duplicado, ' +
                   'pero NO se fusionan automaticamente.',
      correr: function () {
        var res = correr([
          reg({ anio: 2018, nombre: 'MARIA LOPEZ', ts: 5, cl: 10, pi: 0, pf: 10 }),
          reg({ anio: 2018, nombre: 'LOPEZ MARIA', ts: 5, cl: 10, pi: 0, pf: 10 })
        ]);
        return [
          { concepto: 'Empleados distintos en el catalogo', esperado: 2, obtenido: res.empleados.length },
          { concepto: 'Sugerencias de duplicado', esperado: 1, obtenido: res.duplicados.length },
          { concepto: 'Motivo', esperado: 'Mismas palabras en distinto orden',
            obtenido: res.duplicados.length ? res.duplicados[0].motivo : '' }
        ];
      } },

    /* --- 15. Cambio de escritura del nombre ------------------------------ */
    { id: 15, nombre: 'Cambio de escritura del nombre entre anios',
      descripcion: 'Mayusculas, tildes y espacios dobles se homologan automaticamente conservando el original.',
      correr: function () {
        var res = correr([
          reg({ anio: 2018, nombre: 'JUAN PEREZ', ts: 12, cl: 100, iff: 20, pi: 0, pf: 120 }),
          reg({ anio: 2019, nombre: '  Juan   Pérez ', ts: 13, cl: 110, iff: 22, pi: 120, pf: 252 })
        ]);
        var e = res.empleados[0];
        return [
          { concepto: 'Empleados en el catalogo', esperado: 1, obtenido: res.empleados.length },
          { concepto: 'Nombre normalizado', esperado: 'JUAN PEREZ', obtenido: e.nombre_norm },
          { concepto: 'Escrituras conservadas', esperado: 2, obtenido: e.nombres_originales.length },
          { concepto: 'Cruce 2019', esperado: 'CONTINUA', obtenido: fila(res, 'JUAN PEREZ', 'JP', 2019).cruce }
        ];
      } },

    /* --- 16. Empleado que desaparece ------------------------------------- */
    { id: 16, nombre: 'Empleado que desaparece de un anio a otro',
      descripcion: 'Si no se registra como SALIDA se emite una ADVERTENCIA.',
      correr: function () {
        var res = correr([
          reg({ anio: 2018, nombre: 'OSCAR LEON', ts: 8, cl: 100, iff: 10, pi: 0, pf: 110 }),
          reg({ anio: 2019, nombre: 'ANA TORRES', ts: 6, cl: 110, iff: 12, pi: 0, pf: 122 })
        ]);
        return [
          { concepto: 'Alerta EMPLEADO_DESAPARECE', esperado: true, obtenido: tieneAlerta(res, 'EMPLEADO_DESAPARECE') }
        ];
      } },

    /* --- 17. BD: reglas propias del regimen ------------------------------ */
    { id: 17, nombre: 'BD sigue reglas distintas a JP en el mismo anio',
      descripcion: 'En 2021 la BD es deducible sin ID; la JP sin fondeo es no deducible con ID.',
      correr: function () {
        var res = correr([
          reg({ anio: 2021, regimen: 'BD', nombre: 'SARA NUNEZ', ts: 12, cl: 100, iff: 20, pi: 500, pf: 620 }),
          reg({ anio: 2021, regimen: 'JP', nombre: 'SARA NUNEZ', ts: 12, cl: 100, iff: 20, pi: 500, pf: 620 })
        ]);
        var bd = fila(res, 'SARA NUNEZ', 'BD', 2021);
        var jp = fila(res, 'SARA NUNEZ', 'JP', 2021);
        return [
          { concepto: 'BD regla', esperado: 'BD-04', obtenido: bd.regla_id },
          { concepto: 'BD deducible', esperado: true, obtenido: bd.deducible },
          { concepto: 'BD considera ID', esperado: false, obtenido: bd.aplica_id },
          { concepto: 'JP regla (sin fondeo)', esperado: 'JP-05', obtenido: jp.regla_id },
          { concepto: 'JP deducible', esperado: false, obtenido: jp.deducible },
          { concepto: 'JP considera ID', esperado: true, obtenido: jp.aplica_id }
        ];
      } },

    /* --- 18. Tarifa de IR no configurada --------------------------------- */
    { id: 18, nombre: 'Tarifa de Impuesto a la Renta no configurada',
      descripcion: 'Sin tarifa el programa no inventa un valor: deja el ID en 0 y emite alerta CRITICA.',
      correr: function () {
        var c = cfgPrueba();
        c.tarifas_ir = {};
        var res = correr([
          reg({ anio: 2018, nombre: 'HUGO RAMOS', ts: 12, cl: 100, iff: 20, pi: 500, pf: 620 })
        ], c);
        var f = fila(res, 'HUGO RAMOS', 'JP', 2018);
        return [
          { concepto: 'Estado de la tarifa', esperado: 'NO CONFIGURADA', obtenido: f.tarifa_ir_estado },
          { concepto: 'Impuesto diferido ERI', esperado: 0, obtenido: f.id_eri },
          { concepto: 'Alerta TARIFA_IR_INEXISTENTE', esperado: true, obtenido: tieneAlerta(res, 'TARIFA_IR_INEXISTENTE') }
        ];
      } },

    /* --- 19. Anio sin regla configurada ---------------------------------- */
    { id: 19, nombre: 'Anio fuera del alcance de las reglas',
      descripcion: 'Para 2024 no hay regla cargada: el tratamiento queda NO DETERMINADO, sin asumir resultado.',
      correr: function () {
        var res = correr([
          reg({ anio: 2024, nombre: 'NORA SOTO', ts: 12, cl: 100, iff: 20, pi: 500, pf: 620 })
        ]);
        var f = fila(res, 'NORA SOTO', 'JP', 2024);
        return [
          { concepto: 'Tratamiento', esperado: 'NO DETERMINADO', obtenido: f.tratamiento },
          { concepto: 'Deducible', esperado: null, obtenido: f.deducible },
          { concepto: 'ERI movimiento', esperado: 0, obtenido: f.mov_eri },
          { concepto: 'Alerta REGLA_SIN_CONFIGURAR', esperado: true, obtenido: tieneAlerta(res, 'REGLA_SIN_CONFIGURAR') }
        ];
      } },

    /* --- 20. Salida con pasivo distinto de cero --------------------------- */
    { id: 20, nombre: 'Salida con pasivo distinto de cero',
      descripcion: 'No califica como salida anticipada y genera alerta CRITICA.',
      correr: function () {
        var res = correr([
          reg({ anio: 2018, nombre: 'TERESA VACA', ts: 12, cl: 0, iff: 0, pi: 900, sa: 500, pf: 400, status: 'Salida' })
        ]);
        var f = fila(res, 'TERESA VACA', 'JP', 2018);
        return [
          { concepto: 'Salida anticipada', esperado: 'NO', obtenido: f.salida_anticipada },
          { concepto: 'Alerta SALIDA_PASIVO_NO_CERO', esperado: true, obtenido: tieneAlerta(res, 'SALIDA_PASIVO_NO_CERO') }
        ];
      } }
  ];

  /* ======================================================================= *
   * EJECUCION
   * ======================================================================= */
  function ejecutarTodos() {
    var salida = [];
    CASOS.forEach(function (c) {
      var checks;
      try { checks = c.correr(); }
      catch (e) {
        salida.push({
          id: c.id, nombre: c.nombre, descripcion: c.descripcion, estado: 'ERROR',
          checks: [{ concepto: 'Excepcion', esperado: 'sin error', obtenido: String(e && e.message || e), ok: false }]
        });
        return;
      }
      var todos = checks.map(function (k) {
        var ok;
        if (typeof k.esperado === 'number' && typeof k.obtenido === 'number') ok = aprox(k.esperado, k.obtenido);
        else ok = (k.esperado === k.obtenido) ||
                  (k.esperado === null && (k.obtenido === null || k.obtenido === undefined));
        return Object.assign({}, k, { ok: ok });
      });
      salida.push({
        id: c.id, nombre: c.nombre, descripcion: c.descripcion,
        estado: todos.every(function (k) { return k.ok; }) ? 'PASA' : 'FALLA',
        checks: todos
      });
    });
    return salida;
  }

  function resumen(resultados) {
    return {
      total: resultados.length,
      pasan: resultados.filter(function (r) { return r.estado === 'PASA'; }).length,
      fallan: resultados.filter(function (r) { return r.estado !== 'PASA'; }).length
    };
  }

  return { CASOS: CASOS, ejecutarTodos: ejecutarTodos, resumen: resumen, reg: reg, cfgPrueba: cfgPrueba };
})();
