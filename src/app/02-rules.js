/* =============================================================================
 * MODULO: MOTOR DE REGLAS TRIBUTARIAS
 * -----------------------------------------------------------------------------
 * Independiente de la interfaz y del motor de calculo. Recibe un hecho
 * (regimen, anio, tiempo de servicio, fondeo) y devuelve el tratamiento
 * tributario aplicable, la regla que lo produjo y su estado.
 *
 * REQUISITO FUNDAMENTAL (prompt seccion 30): si no existe regla que cubra el
 * hecho, NO se asume ningun resultado tributario. Se devuelve NO_DETERMINADO
 * y el motor de validaciones emite una alerta CRITICA.
 * ========================================================================== */
var APP = window.APP;

APP.Reglas = (function () {

  /** Devuelve el conjunto de reglas configurado para un regimen. */
  function reglasDe(cfg, regimen) {
    return regimen === 'BD' ? (cfg.reglas_bd || []) : (cfg.reglas_jp || []);
  }

  /** Verifica si un anio cae dentro del rango [desde, hasta] (null = abierto). */
  function anioEnRango(anio, desde, hasta) {
    if (desde !== null && desde !== undefined && desde !== '' && anio < Number(desde)) return false;
    if (hasta !== null && hasta !== undefined && hasta !== '' && anio > Number(hasta)) return false;
    return true;
  }

  /** ts_min inclusivo (TS >= ts_min); ts_max exclusivo (TS < ts_max). */
  function tsCumple(ts, r) {
    var tieneMin = r.ts_min !== null && r.ts_min !== undefined && r.ts_min !== '';
    var tieneMax = r.ts_max !== null && r.ts_max !== undefined && r.ts_max !== '';
    if (!tieneMin && !tieneMax) return true;
    if (ts === null || ts === undefined || isNaN(ts)) return false; // sin TS no se puede decidir
    if (tieneMin && !(ts >= Number(r.ts_min))) return false;
    if (tieneMax && !(ts < Number(r.ts_max))) return false;
    return true;
  }

  function fondeoCumple(fondeo, r) {
    if (r.fondeo === null || r.fondeo === undefined || r.fondeo === '') return true; // indiferente
    if (fondeo === null || fondeo === undefined) return false;                        // dato faltante
    return Boolean(fondeo) === Boolean(r.fondeo);
  }

  /**
   * Evalua el tratamiento tributario.
   * @param {object} cfg      configuracion vigente
   * @param {string} regimen  'JP' | 'BD'
   * @param {number} anio
   * @param {number} ts       tiempo de servicio en anios
   * @param {boolean|null} fondeo
   * @returns {object} { encontrada, regla_id, deducible, aplica_id, estado, nota, fuente, tratamiento }
   */
  function evaluar(cfg, regimen, anio, ts, fondeo) {
    var lista = reglasDe(cfg, regimen);
    for (var i = 0; i < lista.length; i++) {
      var r = lista[i];
      if (r.regimen && r.regimen !== regimen) continue;
      if (!anioEnRango(anio, r.desde, r.hasta)) continue;
      if (!tsCumple(ts, r)) continue;
      if (!fondeoCumple(fondeo, r)) continue;
      return {
        encontrada: true,
        regla_id: r.id,
        deducible: !!r.deducible,
        aplica_id: !!r.impuesto_diferido,
        estado: r.estado || 'CONFIRMADA',
        nota: r.nota || '',
        fuente: r.fuente || '',
        tratamiento: (r.deducible ? 'DEDUCIBLE' : 'NO DEDUCIBLE') +
                     (r.impuesto_diferido ? ' + IMPUESTO DIFERIDO' : '')
      };
    }
    return {
      encontrada: false,
      regla_id: null,
      deducible: null,           // NO se asume
      aplica_id: null,           // NO se asume
      estado: 'PENDIENTE_DEFINIR',
      nota: 'No existe regla configurada para ' + regimen + ' ' + anio +
            ' con TS=' + (ts === null || ts === undefined ? 's/d' : ts) +
            ' y fondeo=' + (fondeo === null || fondeo === undefined ? 's/d' : fondeo) + '.',
      fuente: '',
      tratamiento: 'NO DETERMINADO'
    };
  }

  /** Descripcion legible de una regla, para la pantalla de trazabilidad. */
  function describir(r) {
    var cond = [];
    if (r.desde || r.hasta) {
      cond.push('anio ' + (r.desde ? r.desde : 'inicio') + ' a ' + (r.hasta ? r.hasta : 'fin'));
    }
    if (r.ts_min !== null && r.ts_min !== undefined && r.ts_min !== '') cond.push('TS >= ' + r.ts_min);
    if (r.ts_max !== null && r.ts_max !== undefined && r.ts_max !== '') cond.push('TS < ' + r.ts_max);
    if (r.fondeo === true) cond.push('con fondeo');
    if (r.fondeo === false) cond.push('sin fondeo');
    return '[' + r.id + '] SI ' + (cond.join(' y ') || 'siempre') + ' ENTONCES ' +
           (r.deducible ? 'gasto deducible' : 'gasto no deducible') +
           (r.impuesto_diferido ? ' + se considera impuesto diferido' : ' + no se considera impuesto diferido');
  }

  /** Valida la coherencia del conjunto de reglas (para la pantalla Parametros). */
  function validarConjunto(cfg, aniosAnalizados) {
    var problemas = [];
    ['JP', 'BD'].forEach(function (reg) {
      var lista = reglasDe(cfg, reg);
      if (!lista.length) {
        problemas.push({ regimen: reg, tipo: 'SIN_REGLAS', detalle: 'No hay reglas configuradas para ' + reg + '.' });
        return;
      }
      var ids = {};
      lista.forEach(function (r) {
        if (ids[r.id]) problemas.push({ regimen: reg, tipo: 'ID_DUPLICADO', detalle: 'Id de regla repetido: ' + r.id });
        ids[r.id] = true;
      });
      // Cobertura: para cada anio analizado se prueban TS bajo y alto, con y sin fondeo.
      (aniosAnalizados || []).forEach(function (a) {
        var casos = [
          { ts: 5, f: true }, { ts: 5, f: false },
          { ts: 15, f: true }, { ts: 15, f: false }
        ];
        casos.forEach(function (c) {
          var r = evaluar(cfg, reg, a, c.ts, c.f);
          if (!r.encontrada) {
            problemas.push({
              regimen: reg, tipo: 'SIN_COBERTURA',
              detalle: reg + ' ' + a + ' (TS=' + c.ts + ', fondeo=' + c.f + '): no hay regla aplicable.'
            });
          }
        });
      });
    });
    return problemas;
  }

  return {
    evaluar: evaluar,
    describir: describir,
    validarConjunto: validarConjunto,
    reglasDe: reglasDe
  };
})();
