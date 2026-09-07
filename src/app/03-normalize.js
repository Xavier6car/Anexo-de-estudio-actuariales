/* =============================================================================
 * MODULO: NORMALIZACION Y HOMOLOGACION DE EMPLEADOS
 * -----------------------------------------------------------------------------
 * Excel paso 2 (celda D9): "Realizar la validacion de los nombres, donde todos,
 * a traves de los anios, puedan quedar estandarizados y no exista duplicacion".
 *
 * PRINCIPIO: nunca se destruye el dato original. Se agrega el nombre normalizado
 * y un identificador unico. Las fusiones automaticas se limitan a coincidencias
 * exactas del nombre normalizado; todo lo demas se propone al usuario y requiere
 * su confirmacion explicita.
 * ========================================================================== */
var APP = window.APP;

APP.Normaliza = (function () {

  /** Quita tildes y diacriticos (la enie queda convertida en N). */
  function sinTildes(s) {
    return s.normalize('NFD').replace(/[̀-ͯ]/g, '');
  }

  /**
   * Normalizacion canonica de un nombre:
   * mayusculas, sin tildes, sin caracteres especiales, sin espacios dobles.
   */
  function normalizar(nombre) {
    if (nombre === null || nombre === undefined) return '';
    var s = String(nombre);
    // los espacios duros (nbsp) son parte de s y se colapsan mas abajo
    s = sinTildes(s).toUpperCase();
    s = s.replace(/[^A-Z0-9\s]/g, ' ');     // puntos, comas, guiones, etc.
    s = s.replace(/\s+/g, ' ').trim();
    return s;
  }

  /** Clave insensible al orden de los apellidos/nombres ("PEREZ JUAN" == "JUAN PEREZ"). */
  function claveOrdenada(nombreNorm) {
    return nombreNorm.split(' ').filter(Boolean).sort().join(' ');
  }

  /** Distancia de Levenshtein (iterativa, O(n*m) con una sola fila). */
  function levenshtein(a, b) {
    if (a === b) return 0;
    if (!a.length) return b.length;
    if (!b.length) return a.length;
    var prev = new Array(b.length + 1), i, j, tmp, cur;
    for (j = 0; j <= b.length; j++) prev[j] = j;
    for (i = 1; i <= a.length; i++) {
      cur = [i];
      for (j = 1; j <= b.length; j++) {
        tmp = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + tmp);
      }
      prev = cur;
    }
    return prev[b.length];
  }

  /** Similitud 0..1 entre dos cadenas. */
  function similitud(a, b) {
    if (!a.length && !b.length) return 1;
    var m = Math.max(a.length, b.length);
    return 1 - (levenshtein(a, b) / m);
  }

  /**
   * Construye el catalogo de empleados a partir de los registros crudos.
   * Agrupa por nombre normalizado EXACTO (fusion segura) y aplica las
   * fusiones manuales previamente confirmadas por el usuario.
   *
   * @param {Array}  registros  filas crudas con { nombre_original, anio, ... }
   * @param {object} fusiones   mapa { claveNormalizada: empleado_id_destino }
   * @returns {object} { empleados: [...], porClave: {clave: empleado} }
   */
  function construirCatalogo(registros, fusiones) {
    fusiones = fusiones || {};
    var porClave = {};
    var empleados = [];
    var seq = 0;

    registros.forEach(function (r) {
      var norm = normalizar(r.nombre_original);
      if (!norm) return;
      var claveDestino = fusiones[norm] || norm;

      if (!porClave[claveDestino]) {
        seq += 1;
        var e = {
          empleado_id: 'E' + String(seq).padStart(4, '0'),
          nombre_norm: claveDestino,
          nombre_canonico: r.nombre_original,       // primer original visto
          nombres_originales: [],
          claves_fusionadas: [],
          anios: [],
          regimenes: [],
          sexo: r.sexo || '',
          edades: {},
          ts: {}
        };
        porClave[claveDestino] = e;
        empleados.push(e);
      }
      var emp = porClave[claveDestino];
      if (emp.nombres_originales.indexOf(r.nombre_original) < 0) emp.nombres_originales.push(r.nombre_original);
      if (norm !== claveDestino && emp.claves_fusionadas.indexOf(norm) < 0) emp.claves_fusionadas.push(norm);
      if (emp.anios.indexOf(r.anio) < 0) emp.anios.push(r.anio);
      if (r.regimen && emp.regimenes.indexOf(r.regimen) < 0) emp.regimenes.push(r.regimen);
      if (!emp.sexo && r.sexo) emp.sexo = r.sexo;
      if (r.edad !== null && r.edad !== undefined) emp.edades[r.anio] = r.edad;
      if (r.ts !== null && r.ts !== undefined) emp.ts[r.anio] = r.ts;

      r.nombre_norm = norm;
      r.empleado_id = emp.empleado_id;
    });

    empleados.forEach(function (e) { e.anios.sort(function (a, b) { return a - b; }); });
    return { empleados: empleados, porClave: porClave };
  }

  /**
   * Detecta posibles duplicados NO fusionados automaticamente.
   * Devuelve pares candidatos con su motivo y similitud, para que el usuario decida.
   * Nunca fusiona por su cuenta (prompt seccion 3, punto 4).
   */
  function detectarDuplicados(empleados, umbral) {
    umbral = umbral || 0.90;
    var sugerencias = [];
    var porOrden = {};

    empleados.forEach(function (e) {
      var k = claveOrdenada(e.nombre_norm);
      (porOrden[k] = porOrden[k] || []).push(e);
    });

    // 1) Mismo conjunto de palabras en distinto orden -> alta confianza
    Object.keys(porOrden).forEach(function (k) {
      var grupo = porOrden[k];
      if (grupo.length > 1) {
        for (var i = 0; i < grupo.length; i++) {
          for (var j = i + 1; j < grupo.length; j++) {
            sugerencias.push({
              a: grupo[i], b: grupo[j], similitud: 1,
              motivo: 'Mismas palabras en distinto orden'
            });
          }
        }
      }
    });

    // 2) Similitud textual alta -> confianza media
    var vistos = {};
    sugerencias.forEach(function (s) { vistos[s.a.empleado_id + '|' + s.b.empleado_id] = true; });

    for (var x = 0; x < empleados.length; x++) {
      for (var y = x + 1; y < empleados.length; y++) {
        var a = empleados[x], b = empleados[y];
        if (vistos[a.empleado_id + '|' + b.empleado_id]) continue;
        // filtro rapido por longitud para no evaluar Levenshtein en todos los pares
        if (Math.abs(a.nombre_norm.length - b.nombre_norm.length) > 4) continue;
        var sim = similitud(a.nombre_norm, b.nombre_norm);
        if (sim >= umbral) {
          sugerencias.push({
            a: a, b: b, similitud: sim,
            motivo: 'Nombres muy similares (' + (sim * 100).toFixed(1) + '%)'
          });
        }
      }
    }

    sugerencias.sort(function (p, q) { return q.similitud - p.similitud; });
    return sugerencias;
  }

  /**
   * Empleados cuyo nombre original varia entre anios (misma clave normalizada).
   * Son informativos: indican que la normalizacion hizo su trabajo.
   */
  function variacionesDeNombre(empleados) {
    return empleados.filter(function (e) { return e.nombres_originales.length > 1; });
  }

  return {
    normalizar: normalizar,
    claveOrdenada: claveOrdenada,
    similitud: similitud,
    levenshtein: levenshtein,
    construirCatalogo: construirCatalogo,
    detectarDuplicados: detectarDuplicados,
    variacionesDeNombre: variacionesDeNombre
  };
})();
