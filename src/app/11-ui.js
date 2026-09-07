/* =============================================================================
 * MODULO: INTERFAZ
 * -----------------------------------------------------------------------------
 * Capa de presentacion. No contiene reglas tributarias ni formulas: todo lo
 * delega en los modulos de configuracion, reglas, motor, validaciones,
 * conciliacion, trazabilidad y exportacion.
 * ========================================================================== */
var APP = window.APP;

APP.UI = (function () {

  /* ====================================================================== *
   * ESTADO DE LA APLICACION (vive solo en memoria)
   * ====================================================================== */
  var S = {
    cfg: null,
    archivos: [],          // { nombre, tipo, hoja, filas, cuando }
    actuariales: [],
    resumenes: [],
    contables: [],
    fusiones: {},          // claveNormalizada -> claveDestino
    overrides: {},         // 'empId|reg|anio' -> ajustes manuales
    resultado: null,
    alertas: [],
    conciliaciones: [],
    pantalla: 'dashboard',
    sub: '',
    filtro: { anio: '', regimen: '', texto: '', severidad: '' },
    pruebas: null,
    traza: null,
    pendiente: null        // datos del modal de mapeo
  };
  APP.S = S;

  /* ====================================================================== *
   * UTILIDADES
   * ====================================================================== */
  function $(sel, raiz) { return (raiz || document).querySelector(sel); }
  function esc(s) {
    if (s === null || s === undefined) return '';
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function fmt(v, dec) {
    if (v === null || v === undefined || v === '' || (typeof v === 'number' && isNaN(v))) return '';
    var n = Number(v);
    if (isNaN(n)) return esc(v);
    return n.toLocaleString('es-EC', {
      minimumFractionDigits: dec === undefined ? 2 : dec,
      maximumFractionDigits: dec === undefined ? 2 : dec
    });
  }
  function fmt0(v) { return fmt(v, 0); }
  function pct(v) { return (v === null || v === undefined || v === '') ? '—' : (Number(v) * 100).toFixed(2) + '%'; }
  function suma(arr, campo) {
    return arr.reduce(function (a, f) {
      var v = f[campo];
      return a + ((typeof v === 'number' && isFinite(v)) ? v : 0);
    }, 0);
  }

  function toast(msg, tipo) {
    var d = document.createElement('div');
    d.style.cssText = 'position:fixed;bottom:22px;left:50%;transform:translateX(-50%);z-index:200;' +
      'padding:11px 18px;border-radius:8px;font-size:13px;font-weight:500;box-shadow:0 8px 28px rgba(0,0,0,.22);' +
      'background:' + (tipo === 'error' ? '#c8372d' : tipo === 'ok' ? '#1f9d67' : '#16283d') + ';color:#fff;max-width:70vw';
    d.textContent = msg;
    document.body.appendChild(d);
    setTimeout(function () { d.style.transition = 'opacity .3s'; d.style.opacity = '0'; }, 2800);
    setTimeout(function () { d.remove(); }, 3200);
  }

  /* --- Tabla generica ---------------------------------------------------- */
  /**
   * @param cols [{ k, h, t:'txt'|'num'|'tag'|'int', tag:fn, w }]
   * @param rows []
   * @param opc  { totales:[claves], maxFilas, onFila:'accion', clave:fn }
   */
  function tabla(cols, rows, opc) {
    opc = opc || {};
    var max = opc.maxFilas || 3000;
    var recortado = rows.length > max;
    var vista = recortado ? rows.slice(0, max) : rows;

    var h = '<div class="tabla-caja"><table class="datos"><thead><tr>';
    cols.forEach(function (c) {
      h += '<th class="' + (c.t === 'num' || c.t === 'int' ? 'num' : '') + '">' + esc(c.h) + '</th>';
    });
    h += '</tr></thead><tbody>';

    vista.forEach(function (r, i) {
      var attrs = opc.onFila ? ' class="fila-click" data-accion="' + opc.onFila + '" data-i="' +
        (opc.clave ? esc(opc.clave(r)) : i) + '" style="cursor:pointer"' : '';
      h += '<tr' + attrs + '>';
      cols.forEach(function (c) {
        var v = typeof c.k === 'function' ? c.k(r) : r[c.k];
        if (c.t === 'num') {
          var neg = typeof v === 'number' && v < 0;
          h += '<td class="num' + (neg ? ' neg' : '') + '">' + fmt(v) + '</td>';
        } else if (c.t === 'int') {
          h += '<td class="num">' + (v === null || v === undefined ? '' : esc(v)) + '</td>';
        } else if (c.t === 'tag') {
          h += '<td>' + (v === null || v === undefined || v === '' ? '' :
            '<span class="tag ' + (c.tag ? c.tag(v, r) : 'info') + '">' + esc(v) + '</span>') + '</td>';
        } else {
          h += '<td>' + esc(v === null || v === undefined ? '' : v) + '</td>';
        }
      });
      h += '</tr>';
    });
    h += '</tbody>';

    if (opc.totales && opc.totales.length && rows.length) {
      h += '<tfoot><tr>';
      cols.forEach(function (c, ci) {
        if (ci === 0) { h += '<td>TOTAL (' + fmt0(rows.length) + ')</td>'; return; }
        if (opc.totales.indexOf(c.k) >= 0) {
          h += '<td class="num">' + fmt(suma(rows, c.k)) + '</td>';
        } else { h += '<td></td>'; }
      });
      h += '</tr></tfoot>';
    }
    h += '</table></div>';
    if (recortado) {
      h += '<p class="nota mini" style="padding:8px 12px">Se muestran las primeras ' + fmt0(max) +
        ' filas de ' + fmt0(rows.length) + '. Exporte a Excel para ver el detalle completo.</p>';
    }
    if (!rows.length) {
      h = '<div class="vacio"><div class="ic">—</div><div class="t">Sin registros</div>' +
          '<div class="s">' + esc(opc.vacio || 'No hay informacion para los filtros seleccionados.') + '</div></div>';
    }
    return h;
  }

  function tagSev(v) { return v === 'CRITICA' ? 'crit' : v === 'ADVERTENCIA' ? 'warn' : 'info'; }
  function tagStatus(v) {
    return v === 'SALIDA' ? 'warn' : v === 'INGRESO' ? 'brand' : v === 'JUBILADO' ? 'info' : 'ok';
  }
  function tagEstado(v) { return v === 'OK' || v === 'SI' || v === 'CLASIFICADA' || v === 'PASA' ? 'ok'
    : v === 'REVISAR' || v === 'REVISION MANUAL' || v === 'FALLA' || v === 'INCONSISTENTE' ? 'crit' : 'info'; }

  /* --- Filtro comun ------------------------------------------------------ */
  function barraFiltros(conTexto) {
    var anios = S.resultado ? S.resultado.anios : [];
    var h = '<div class="fila" style="margin-bottom:12px">';
    h += '<select data-filtro="anio"><option value="">Todos los anios</option>';
    anios.forEach(function (a) {
      h += '<option value="' + a + '"' + (String(S.filtro.anio) === String(a) ? ' selected' : '') + '>' + a + '</option>';
    });
    h += '</select>';
    h += '<select data-filtro="regimen"><option value="">JP y BD</option>' +
      '<option value="JP"' + (S.filtro.regimen === 'JP' ? ' selected' : '') + '>Solo JP</option>' +
      '<option value="BD"' + (S.filtro.regimen === 'BD' ? ' selected' : '') + '>Solo BD</option></select>';
    if (conTexto !== false) {
      h += '<input type="text" data-filtro="texto" placeholder="Buscar empleado..." value="' +
        esc(S.filtro.texto) + '" style="min-width:220px">';
    }
    h += '</div>';
    return h;
  }

  function filas() {
    if (!S.resultado) return [];
    return S.resultado.filas.filter(function (f) {
      if (S.filtro.anio && String(f.anio) !== String(S.filtro.anio)) return false;
      if (S.filtro.regimen && f.regimen !== S.filtro.regimen) return false;
      if (S.filtro.texto) {
        var t = S.filtro.texto.toUpperCase();
        if ((f.nombre_original || '').toUpperCase().indexOf(t) < 0 &&
            (f.empleado_id || '').toUpperCase().indexOf(t) < 0) return false;
      }
      return true;
    });
  }

  /* ====================================================================== *
   * NAVEGACION
   * ====================================================================== */
  var PANTALLAS = [
    { g: 'Inicio' },
    { id: 'dashboard', ic: '▤', t: 'Dashboard' },
    { g: 'Preparacion' },
    { id: 'carga', ic: '↥', t: 'Carga de informacion' },
    { id: 'homologacion', ic: '⇄', t: 'Homologacion' },
    { id: 'parametros', ic: '⚙', t: 'Parametros y reglas' },
    { g: 'Analisis' },
    { id: 'proceso', ic: '▶', t: 'Procesamiento' },
    { id: 'resultados', ic: '☰', t: 'Resultados' },
    { id: 'alertas', ic: '!', t: 'Alertas' },
    { id: 'traza', ic: '⌕', t: 'Detalle del calculo' },
    { g: 'Cierre' },
    { id: 'exportar', ic: '↧', t: 'Exportar' },
    { id: 'pruebas', ic: '✓', t: 'Pruebas' },
    { id: 'seguridad', ic: '⛨', t: 'Datos y seguridad' }
  ];

  function pintarNav() {
    var criticas = S.alertas.filter(function (a) { return a.severidad === 'CRITICA'; }).length;
    var h = '<div class="marca"><div class="t">Anexo JP y BD</div>' +
            '<div class="s">Analisis tributario - Ecuador</div></div>';
    PANTALLAS.forEach(function (p) {
      if (p.g) { h += '<div class="grupo">' + esc(p.g) + '</div>'; return; }
      var pill = (p.id === 'alertas' && criticas) ? '<span class="pill">' + criticas + '</span>' : '';
      h += '<button data-ir="' + p.id + '" class="' + (S.pantalla === p.id ? 'on' : '') + '">' +
        '<span class="ic">' + p.ic + '</span><span>' + esc(p.t) + '</span>' + pill + '</button>';
    });
    h += '<div class="pie">v' + APP.VERSION + ' · procesamiento 100% local<br>La informacion no sale del equipo.</div>';
    $('#nav').innerHTML = h;
  }

  var TITULOS = {
    dashboard: ['Dashboard', 'Panorama del analisis en curso'],
    carga: ['Carga de informacion', 'Informes actuariales, resumenes y respaldo contable'],
    homologacion: ['Homologacion de empleados', 'Identificacion unica a traves de los anios'],
    parametros: ['Parametros y reglas tributarias', 'Configurables sin modificar el programa'],
    proceso: ['Procesamiento', 'Ejecucion del analisis'],
    resultados: ['Resultados', 'Anexo de JP y BD calculado'],
    alertas: ['Alertas y validaciones', 'Revision de inconsistencias'],
    traza: ['Detalle del calculo', 'Resultado, formula, datos utilizados y origen'],
    exportar: ['Exportacion', 'Anexo final en Excel'],
    pruebas: ['Pruebas', 'Resultado esperado vs. resultado calculado'],
    seguridad: ['Datos y seguridad', 'Confidencialidad, respaldo y borrado']
  };

  function ir(p) { S.pantalla = p; S.traza = null; pintar(); }

  function pintar() {
    pintarNav();
    var t = TITULOS[S.pantalla] || ['', ''];
    var acc = '';
    if (S.resultado) {
      acc = '<span class="tag brand">' + fmt0(S.resultado.empleados.length) + ' empleados</span>' +
            '<span class="tag info">' + S.resultado.anios.length + ' anios</span>';
    }
    $('#barra').innerHTML = '<div><h1>' + esc(t[0]) + '</h1><div class="sub">' + esc(t[1]) + '</div></div>' +
      '<div class="der">' + acc + '</div>';
    $('#vista').innerHTML = (VISTAS[S.pantalla] || function () { return ''; })();
    $('#main').scrollTop = 0;
  }

  /* ====================================================================== *
   * PANTALLA: DASHBOARD
   * ====================================================================== */
  function vistaDashboard() {
    if (!S.resultado) {
      var pasos = [
        ['1', 'Cargar los informes actuariales', S.actuariales.length ? 'ok' : '', 'carga'],
        ['2', 'Cargar los resumenes actuariales (conciliacion)', S.resumenes.length ? 'ok' : '', 'carga'],
        ['3', 'Cargar la informacion contable (salidas ERI/ORI)', S.contables.length ? 'ok' : '', 'carga'],
        ['4', 'Homologar los empleados', '', 'homologacion'],
        ['5', 'Configurar tarifas de IR y reglas tributarias', Object.keys(S.cfg.tarifas_ir).length ? 'ok' : '', 'parametros'],
        ['6', 'Ejecutar el analisis', '', 'proceso']
      ];
      var h = '<div class="aviso"><b>Todavia no se ha ejecutado el analisis</b>' +
        'Siga el flujo de trabajo para generar el Anexo de JP y BD.</div>';
      h += '<div class="tarjeta"><header><h2>Flujo de trabajo</h2></header><div class="cuerpo">';
      pasos.forEach(function (p) {
        h += '<div class="fila" style="padding:9px 0;border-bottom:1px solid var(--line-2)">' +
          '<span class="tag ' + (p[2] ? 'ok' : 'info') + '">' + (p[2] ? '✓' : p[0]) + '</span>' +
          '<span style="flex:1">' + esc(p[1]) + '</span>' +
          '<button class="btn mini" data-ir="' + p[3] + '">Ir</button></div>';
      });
      h += '</div></div>';
      h += '<div class="tarjeta"><header><h2>Que hace este programa</h2></header><div class="cuerpo">' +
        '<p class="nota">Reproduce los 32 pasos del procedimiento <i>Proceso de Elaboracion de Anexo de JP y BD</i>: ' +
        'homologacion de empleados, status laboral y cruce entre anios, resumen unificado, tratamiento tributario ' +
        'de JP y BD, movimiento de valores deducibles, salidas anticipadas, ingresos gravados y no gravados, ' +
        'analisis de ORI negativo, impuestos diferidos con sus reversiones, deduccion adicional por pagos e ' +
        'ingreso gravado adicional. Todo el procesamiento ocurre en este equipo.</p></div></div>';
      return h;
    }

    var R = S.resultado;
    var ult = R.anios[R.anios.length - 1];
    var fUlt = R.filas.filter(function (f) { return f.anio === ult; });
    var jp = fUlt.filter(function (f) { return f.regimen === 'JP'; });
    var bd = fUlt.filter(function (f) { return f.regimen === 'BD'; });
    var pend = R.filas.filter(function (f) { return f.clasificacion_estado === 'REVISION MANUAL'; }).length;
    var difs = S.conciliaciones.filter(function (c) { return c.estado === 'REVISAR'; }).length;
    var res = APP.Validaciones.resumen(S.alertas);

    function kpi(et, v, d, cls) {
      return '<div class="kpi ' + (cls || '') + '"><div class="et">' + esc(et) + '</div>' +
        '<div class="v">' + v + '</div><div class="d">' + esc(d || '') + '</div></div>';
    }

    var h = '<div class="rejilla c4" style="margin-bottom:16px">';
    h += kpi('Empleados', fmt0(R.empleados.length), 'identificados de forma unica');
    h += kpi('Anios procesados', R.anios.length, R.anios[0] + ' a ' + ult);
    h += kpi('Pasivo JP ' + ult, fmt(suma(jp, 'pasivo_final')), fmt0(jp.length) + ' registros');
    h += kpi('Pasivo BD ' + ult, fmt(suma(bd, 'pasivo_final')), fmt0(bd.length) + ' registros');
    h += '</div><div class="rejilla c4" style="margin-bottom:16px">';
    h += kpi('Saldo deducible ' + ult, fmt(suma(fUlt, 'saldo_deducible')), 'al 31-dic-' + ult, 'ok');
    h += kpi('Saldo no deducible ' + ult, fmt(suma(fUlt, 'saldo_no_deducible')), 'al 31-dic-' + ult, 'warn');
    h += kpi('Saldo diferido activo ' + ult, fmt(suma(fUlt, 'saldo_dif_activo')), 'ERI + ORI');
    h += kpi('Reversiones acumuladas', fmt(Math.abs(suma(R.filas, 'rev_aid_eri')) + Math.abs(suma(R.filas, 'rev_aid_ori'))),
      'AID revertido por salidas');
    h += '</div><div class="rejilla c4" style="margin-bottom:16px">';
    h += kpi('Ingreso gravado', fmt(suma(R.filas, 'ingreso_gravado')), 'por salidas anticipadas');
    h += kpi('Ingreso no gravado', fmt(suma(R.filas, 'ingreso_no_gravado')), 'por salidas anticipadas');
    h += kpi('Ing. gravado adicional', fmt(suma(R.filas, 'ingreso_gravado_adicional')), 'compensacion del anio base');
    h += kpi('Deduccion adicional', fmt(suma(R.filas, 'deduccion_adicional')), 'uso del ID por pagos');
    h += '</div><div class="rejilla c4">';
    h += kpi('Diferencias de conciliacion', fmt0(difs), difs ? 'requieren revision' : 'sin diferencias',
      difs ? 'crit' : 'ok');
    h += kpi('Pendientes de revision', fmt0(pend), 'salidas sin clasificar ERI/ORI', pend ? 'warn' : 'ok');
    h += kpi('Alertas criticas', fmt0(res.CRITICA), 'de ' + fmt0(res.total) + ' alertas', res.CRITICA ? 'crit' : 'ok');
    h += kpi('Advertencias', fmt0(res.ADVERTENCIA), fmt0(res.INFORMATIVA) + ' informativas', 'warn');
    h += '</div>';

    h += '<div class="tarjeta" style="margin-top:16px"><header><h2>Movimiento por anio</h2>' +
      '<div class="der"><button class="btn mini" data-ir="resultados">Ver detalle</button></div></header>';
    var porAnio = R.anios.map(function (a) {
      var fa = R.filas.filter(function (f) { return f.anio === a; });
      return {
        anio: a, n: fa.length,
        pasivo_inicial: suma(fa, 'pasivo_inicial'), incremento: suma(fa, 'incremento'),
        ori: suma(fa, 'ori'), pagos: suma(fa, 'pagos'),
        salidas_anticipadas: suma(fa, 'salidas_anticipadas'), pasivo_final: suma(fa, 'pasivo_final'),
        saldo_deducible: suma(fa, 'saldo_deducible'), saldo_no_deducible: suma(fa, 'saldo_no_deducible'),
        total_dif_temporaria: suma(fa, 'total_dif_temporaria'), saldo_dif_activo: suma(fa, 'saldo_dif_activo')
      };
    });
    h += tabla([
      { k: 'anio', h: 'Anio', t: 'int' }, { k: 'n', h: 'Registros', t: 'int' },
      { k: 'pasivo_inicial', h: 'Pasivo inicial', t: 'num' },
      { k: 'incremento', h: 'Incremento', t: 'num' },
      { k: 'ori', h: 'ORI', t: 'num' }, { k: 'pagos', h: 'Pagos', t: 'num' },
      { k: 'salidas_anticipadas', h: 'Salidas ant.', t: 'num' },
      { k: 'pasivo_final', h: 'Pasivo final', t: 'num' },
      { k: 'saldo_deducible', h: 'Saldo deducible', t: 'num' },
      { k: 'saldo_no_deducible', h: 'Saldo no deducible', t: 'num' },
      { k: 'total_dif_temporaria', h: 'Dif. temporaria', t: 'num' },
      { k: 'saldo_dif_activo', h: 'Saldo dif. activo', t: 'num' }
    ], porAnio, {});
    h += '</div>';
    return h;
  }

  /* ====================================================================== *
   * PANTALLA: CARGA
   * ====================================================================== */
  var TIPOS = {
    actuarial: 'Informacion actuarial (detalle de empleados)',
    resumen_jp: 'Resumen actuarial JP',
    resumen_bd: 'Resumen actuarial BD',
    contable: 'Informacion contable (mayores / auditoria)'
  };

  function vistaCarga() {
    var h = '<div class="aviso ok"><b>Procesamiento local</b>Los archivos se leen en la memoria de este navegador. ' +
      'No se suben a ningun servidor ni se guardan en disco. Al cerrar la pestania la informacion desaparece.</div>';

    h += '<div class="rejilla c2">';
    Object.keys(TIPOS).forEach(function (t) {
      var n = t === 'actuarial' ? S.actuariales.length
            : t === 'contable' ? S.contables.length
            : S.resumenes.filter(function (r) { return r.regimen === (t === 'resumen_jp' ? 'JP' : 'BD'); }).length;
      h += '<div class="zona" data-cargar="' + t + '">' +
        '<div class="ic">↥</div><div class="t">' + esc(TIPOS[t]) + '</div>' +
        '<div class="s">Excel (.xlsx, .xls) o CSV' + (n ? ' · ' + fmt0(n) + ' registros cargados' : '') + '</div></div>';
    });
    h += '</div>';

    h += '<div class="tarjeta" style="margin-top:16px"><header><h2>Archivos cargados</h2>' +
      '<div class="der">' +
      '<button class="btn mini" data-accion="plantillas">Descargar plantillas</button>' +
      '<button class="btn mini peligro" data-accion="limpiar-archivos">Eliminar todo</button>' +
      '</div></header>';
    if (!S.archivos.length) {
      h += '<div class="vacio"><div class="ic">↥</div><div class="t">Sin archivos</div>' +
        '<div class="s">Comience cargando el detalle de empleados de los informes actuariales.</div></div>';
    } else {
      h += tabla([
        { k: 'nombre', h: 'Archivo' }, { k: 'hoja', h: 'Hoja' },
        { k: 'tipoTxt', h: 'Tipo' }, { k: 'filas', h: 'Registros', t: 'int' },
        { k: 'anios', h: 'Anios' }, { k: 'cuando', h: 'Cargado' }
      ], S.archivos.map(function (a) {
        return Object.assign({}, a, { tipoTxt: TIPOS[a.tipo] || a.tipo });
      }), {});
    }
    h += '</div>';

    h += '<div class="tarjeta"><header><h2>Columnas que reconoce el programa</h2></header><div class="cuerpo">' +
      '<p class="nota">Al cargar un archivo se detecta la fila de encabezados y se propone un mapeo automatico ' +
      'de columnas, que usted puede corregir antes de confirmar. Campos del paso 1 del procedimiento: ' +
      '<code class="k">Anio</code> <code class="k">Nombre</code> <code class="k">Sexo</code> ' +
      '<code class="k">Edad</code> <code class="k">TS</code> <code class="k">Pasivo neto del anio anterior</code> ' +
      '<code class="k">Costo laboral</code> <code class="k">Interes financiero</code> ' +
      '<code class="k">Incremento</code> <code class="k">Costo por servicios pasados</code> ' +
      '<code class="k">ORI</code> <code class="k">Salidas anticipadas</code> ' +
      '<code class="k">Valores de traspasos</code> <code class="k">Pagos</code>. ' +
      'Opcionales: <code class="k">Status</code> <code class="k">Regimen</code> <code class="k">Pasivo neto final</code> ' +
      '<code class="k">Fondeo</code> <code class="k">Salida ERI</code> <code class="k">Salida ORI</code>.</p>' +
      '</div></div>';
    return h;
  }

  /* --- Modal de mapeo de columnas ---------------------------------------- */
  function abrirMapeo(archivo, tipo) {
    S.pendiente = { archivo: archivo, tipo: tipo, iHoja: 0, filaEnc: null, mapa: null, anioFijo: '', regimenFijo: '' };
    // elige por defecto la hoja con mas filas
    var mejor = 0;
    archivo.hojas.forEach(function (hj, i) { if (hj.aoa.length > archivo.hojas[mejor].aoa.length) mejor = i; });
    S.pendiente.iHoja = mejor;
    recalcularMapeo();
    pintarMapeo();
  }

  function recalcularMapeo() {
    var p = S.pendiente;
    var aoa = p.archivo.hojas[p.iHoja].aoa;
    if (p.filaEnc === null) p.filaEnc = APP.Loader.detectarEncabezado(aoa);
    var headers = aoa[p.filaEnc] || [];
    p.headers = headers;
    p.mapa = APP.Loader.mapearAuto(headers);
    if (p.tipo === 'resumen_jp') p.regimenFijo = 'JP';
    if (p.tipo === 'resumen_bd') p.regimenFijo = 'BD';
  }

  function pintarMapeo() {
    var p = S.pendiente;
    var aoa = p.archivo.hojas[p.iHoja].aoa;
    var headers = p.headers || [];
    var campos = APP.Loader.camposDisponibles();

    var h = '<div class="modal-fondo" data-cerrar-fondo><div class="modal">';
    h += '<header><h3>Mapeo de columnas · ' + esc(p.archivo.nombre) + '</h3>' +
      '<button class="x" data-accion="cerrar-modal">×</button></header><div class="cuerpo">';

    h += '<div class="rejilla c4" style="margin-bottom:14px">';
    h += '<label class="campo"><span>Hoja</span><select data-map="hoja">';
    p.archivo.hojas.forEach(function (hj, i) {
      h += '<option value="' + i + '"' + (i === p.iHoja ? ' selected' : '') + '>' +
        esc(hj.nombre) + ' (' + hj.aoa.length + ' filas)</option>';
    });
    h += '</select></label>';
    h += '<label class="campo"><span>Fila de encabezados</span>' +
      '<input type="number" min="1" data-map="filaEnc" value="' + (p.filaEnc + 1) + '"></label>';
    h += '<label class="campo"><span>Anio (si el archivo no lo trae)</span>' +
      '<input type="number" data-map="anioFijo" placeholder="ej. 2020" value="' + esc(p.anioFijo) + '"></label>';
    h += '<label class="campo"><span>Regimen (si no lo trae)</span><select data-map="regimenFijo">' +
      '<option value="">(desde el archivo)</option>' +
      '<option value="JP"' + (p.regimenFijo === 'JP' ? ' selected' : '') + '>Jubilacion Patronal</option>' +
      '<option value="BD"' + (p.regimenFijo === 'BD' ? ' selected' : '') + '>Bonificacion por Desahucio</option>' +
      '</select></label>';
    h += '</div>';

    h += '<div class="scroll-x"><table class="datos"><thead><tr>' +
      '<th>Columna del archivo</th><th>Contenido de ejemplo</th><th>Campo del anexo</th></tr></thead><tbody>';
    headers.forEach(function (hd, ci) {
      var asignado = '';
      Object.keys(p.mapa).forEach(function (c) { if (p.mapa[c] === ci) asignado = c; });
      var ejemplo = [];
      for (var r = p.filaEnc + 1; r < Math.min(aoa.length, p.filaEnc + 4); r++) {
        var v = aoa[r] && aoa[r][ci];
        if (v !== null && v !== undefined && v !== '') ejemplo.push(String(v).substring(0, 22));
      }
      h += '<tr><td><b>' + esc(hd === null || hd === undefined ? '(col ' + (ci + 1) + ')' : hd) + '</b></td>' +
        '<td style="color:var(--ink-3)">' + esc(ejemplo.join(' · ')) + '</td>' +
        '<td><select data-col="' + ci + '"><option value="">— sin usar —</option>';
      campos.forEach(function (c) {
        h += '<option value="' + c + '"' + (asignado === c ? ' selected' : '') + '>' + esc(c) + '</option>';
      });
      h += '</select></td></tr>';
    });
    h += '</tbody></table></div>';

    var faltan = [];
    if (p.tipo === 'actuarial') {
      ['nombre'].forEach(function (c) { if (p.mapa[c] === undefined) faltan.push(c); });
      if (p.mapa.anio === undefined && !p.anioFijo) faltan.push('anio (o indique un anio fijo)');
    } else if (p.tipo === 'contable') {
      if (p.mapa.nombre === undefined) faltan.push('nombre');
    } else {
      if (p.mapa.concepto === undefined) faltan.push('concepto');
      if (p.mapa.valor === undefined) faltan.push('valor');
    }
    if (faltan.length) {
      h += '<div class="aviso crit" style="margin-top:14px"><b>Faltan campos obligatorios</b>' +
        esc(faltan.join(', ')) + '</div>';
    }

    h += '</div><footer><button class="btn" data-accion="cerrar-modal">Cancelar</button>' +
      '<button class="btn pri" data-accion="confirmar-mapeo"' + (faltan.length ? ' disabled' : '') +
      '>Confirmar e importar</button></footer></div></div>';

    var cont = $('#modal');
    cont.innerHTML = h;
  }

  function confirmarMapeo() {
    var p = S.pendiente;
    var hoja = p.archivo.hojas[p.iHoja];
    var opc = {
      archivo: p.archivo.nombre, hoja: hoja.nombre,
      anioFijo: p.anioFijo ? Number(p.anioFijo) : null,
      regimenFijo: p.regimenFijo || null
    };
    var nuevos;
    if (p.tipo === 'actuarial') {
      nuevos = APP.Loader.construirRegistrosActuariales(hoja.aoa, p.filaEnc, p.mapa, opc);
      S.actuariales = S.actuariales.concat(nuevos);
    } else if (p.tipo === 'contable') {
      nuevos = APP.Loader.construirRegistrosContables(hoja.aoa, p.filaEnc, p.mapa, opc);
      S.contables = S.contables.concat(nuevos);
    } else {
      nuevos = APP.Loader.construirRegistrosResumen(hoja.aoa, p.filaEnc, p.mapa, opc);
      S.resumenes = S.resumenes.concat(nuevos);
    }
    var anios = {};
    nuevos.forEach(function (r) { if (r.anio) anios[r.anio] = true; });
    S.archivos.push({
      nombre: p.archivo.nombre, hoja: hoja.nombre, tipo: p.tipo, filas: nuevos.length,
      anios: Object.keys(anios).sort().join(', '), cuando: new Date().toLocaleTimeString()
    });
    S.pendiente = null;
    $('#modal').innerHTML = '';
    toast(fmt0(nuevos.length) + ' registros importados de ' + p.archivo.nombre, 'ok');
    pintar();
  }

  function elegirArchivo(tipo) {
    var inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = '.xlsx,.xlsm,.xls,.csv,.txt';
    inp.onchange = function () {
      var f = inp.files[0];
      if (!f) return;
      toast('Leyendo ' + f.name + '...');
      APP.Loader.leerArchivo(f).then(function (arch) {
        abrirMapeo(arch, tipo);
      }).catch(function (e) {
        toast('Error al leer el archivo: ' + (e.message || e), 'error');
      });
    };
    inp.click();
  }

  /* ====================================================================== *
   * PANTALLA: HOMOLOGACION
   * ====================================================================== */
  function vistaHomologacion() {
    if (!S.actuariales.length) {
      return '<div class="vacio"><div class="ic">⇄</div><div class="t">Cargue primero la informacion actuarial</div>' +
        '<div class="s">La homologacion trabaja sobre los nombres encontrados en los informes.</div>' +
        '<button class="btn pri" style="margin-top:14px" data-ir="carga">Ir a Carga</button></div>';
    }
    var cat = APP.Normaliza.construirCatalogo(S.actuariales, S.fusiones);
    var dups = APP.Normaliza.detectarDuplicados(cat.empleados, S.cfg.opciones.umbral_similitud_nombres);
    var vars = APP.Normaliza.variacionesDeNombre(cat.empleados);

    var h = '<div class="rejilla c4" style="margin-bottom:16px">' +
      '<div class="kpi"><div class="et">Empleados unicos</div><div class="v">' + fmt0(cat.empleados.length) + '</div>' +
      '<div class="d">tras la normalizacion</div></div>' +
      '<div class="kpi ' + (dups.length ? 'warn' : 'ok') + '"><div class="et">Posibles duplicados</div>' +
      '<div class="v">' + fmt0(dups.length) + '</div><div class="d">requieren su confirmacion</div></div>' +
      '<div class="kpi"><div class="et">Nombres homologados</div><div class="v">' + fmt0(vars.length) + '</div>' +
      '<div class="d">con varias escrituras</div></div>' +
      '<div class="kpi"><div class="et">Fusiones manuales</div><div class="v">' + fmt0(Object.keys(S.fusiones).length) + '</div>' +
      '<div class="d">confirmadas por usted</div></div></div>';

    h += '<div class="tarjeta"><header><h2>Posibles duplicados</h2>' +
      '<div class="der"><span class="nota mini">El programa nunca fusiona por su cuenta.</span></div></header>';
    if (!dups.length) {
      h += '<div class="cuerpo"><p class="nota">No se detectaron nombres sospechosos de duplicidad.</p></div>';
    } else {
      h += '<div class="tabla-caja"><table class="datos"><thead><tr>' +
        '<th>Empleado A</th><th>Empleado B</th><th>Motivo</th><th class="num">Similitud</th><th>Accion</th>' +
        '</tr></thead><tbody>';
      dups.slice(0, 300).forEach(function (d) {
        h += '<tr><td>' + esc(d.a.nombre_canonico) + ' <span class="tag info">' + d.a.empleado_id + '</span></td>' +
          '<td>' + esc(d.b.nombre_canonico) + ' <span class="tag info">' + d.b.empleado_id + '</span></td>' +
          '<td>' + esc(d.motivo) + '</td><td class="num">' + (d.similitud * 100).toFixed(1) + '%</td>' +
          '<td><button class="btn mini" data-accion="fusionar" data-a="' + esc(d.b.nombre_norm) +
          '" data-b="' + esc(d.a.nombre_norm) + '">Es la misma persona</button></td></tr>';
      });
      h += '</tbody></table></div>';
    }
    h += '</div>';

    if (Object.keys(S.fusiones).length) {
      h += '<div class="tarjeta"><header><h2>Fusiones confirmadas</h2>' +
        '<div class="der"><button class="btn mini peligro" data-accion="deshacer-fusiones">Deshacer todas</button></div>' +
        '</header><div class="cuerpo">';
      Object.keys(S.fusiones).forEach(function (k) {
        h += '<div class="fila" style="padding:6px 0;border-bottom:1px solid var(--line-2)">' +
          '<code class="k">' + esc(k) + '</code> <span>→</span> <code class="k">' + esc(S.fusiones[k]) + '</code>' +
          '<button class="btn mini" style="margin-left:auto" data-accion="quitar-fusion" data-a="' + esc(k) + '">Quitar</button>' +
          '</div>';
      });
      h += '</div></div>';
    }

    h += '<div class="tarjeta"><header><h2>Catalogo de empleados</h2>' +
      '<div class="der"><input type="text" data-filtro="texto" placeholder="Buscar..." value="' +
      esc(S.filtro.texto) + '"></div></header>';
    var lista = cat.empleados.filter(function (e) {
      if (!S.filtro.texto) return true;
      return (e.nombre_norm + ' ' + e.nombres_originales.join(' ')).toUpperCase()
        .indexOf(S.filtro.texto.toUpperCase()) >= 0;
    });
    h += tabla([
      { k: 'empleado_id', h: 'ID' },
      { k: 'nombre_canonico', h: 'Nombre original' },
      { k: 'nombre_norm', h: 'Nombre normalizado' },
      { k: function (e) { return e.nombres_originales.join(' | '); }, h: 'Escrituras encontradas' },
      { k: 'sexo', h: 'Sexo' },
      { k: function (e) { return e.anios.join(', '); }, h: 'Anios' },
      { k: function (e) { return e.regimenes.join(', '); }, h: 'Regimenes' }
    ], lista, { maxFilas: 1500 });
    h += '</div>';
    return h;
  }

  /* ====================================================================== *
   * PANTALLA: PARAMETROS
   * ====================================================================== */
  function vistaParametros() {
    var c = S.cfg;
    var anios = S.resultado ? S.resultado.anios : (function () {
      var s = {}; S.actuariales.forEach(function (r) { if (r.anio) s[r.anio] = true; });
      var a = Object.keys(s).map(Number).sort(function (x, y) { return x - y; });
      return a.length ? a : [2017, 2018, 2019, 2020, 2021, 2022, 2023];
    })();

    var h = '<div class="aviso"><b>Las reglas tributarias son datos, no codigo</b>' +
      'Puede modificarlas, exportarlas y volver a cargarlas sin reconstruir el programa. ' +
      'Antes de usar los resultados para una declaracion, contrastelas con la normativa vigente.</div>';

    /* Tarifas IR */
    h += '<div class="tarjeta"><header><h2>Tarifa de Impuesto a la Renta por anio</h2>' +
      '<div class="der"><input type="number" step="0.01" id="tarifa-masiva" placeholder="25" style="width:80px">' +
      '<button class="btn mini" data-accion="tarifa-masiva">Aplicar % a todos los anios</button></div></header>' +
      '<div class="cuerpo"><p class="nota" style="margin-bottom:10px">Paso 21 del procedimiento. ' +
      'El programa no asume ninguna tarifa: los anios sin valor generan alerta critica y su impuesto diferido queda en cero.</p>' +
      '<div class="rejilla c4">';
    anios.forEach(function (a) {
      var v = c.tarifas_ir[a];
      var vacio = (v === undefined || v === null || v === '');
      h += '<label class="campo"><span>' + a + (a < c.anclas.anio_inicio_id ? ' (sin ID)' : '') + '</span>' +
        '<input type="number" step="0.01" data-tarifa="' + a + '" class="' + (vacio && a >= c.anclas.anio_inicio_id ? 'falta' : '') +
        '" value="' + (vacio ? '' : (Number(v) * 100)) + '" placeholder="% no configurado"></label>';
    });
    h += '</div></div></div>';

    /* Alcance: anios a analizar */
    h += '<div class="tarjeta"><header><h2>Anios a analizar</h2>' +
      '<div class="der"><button class="btn mini" data-accion="anios-todos">Usar todos los anios cargados</button>' +
      '</div></header><div class="cuerpo"><div class="rejilla c3">' +
      '<label class="campo"><span>Desde</span><input type="number" data-anios="inicio" placeholder="(todos)" value="' +
      (c.anios.inicio || '') + '"></label>' +
      '<label class="campo"><span>Hasta</span><input type="number" data-anios="fin" placeholder="(todos)" value="' +
      (c.anios.fin || '') + '"></label>' +
      '<div class="nota" style="align-self:end">Anios encontrados en la informacion cargada: <b>' +
      (anios.length ? anios[0] + ' a ' + anios[anios.length - 1] : 'ninguno') + '</b>. ' +
      'Deje los campos vacios para analizarlos todos.</div>' +
      '</div></div></div>';

    /* Anclas y opciones */
    h += '<div class="tarjeta"><header><h2>Anclas del analisis</h2></header><div class="cuerpo"><div class="rejilla c3">' +
      '<label class="campo"><span>Anio base (saldo inicial)</span>' +
      '<input type="number" data-ancla="anio_base" value="' + c.anclas.anio_base + '"></label>' +
      '<label class="campo"><span>Inicio del analisis de impuesto diferido</span>' +
      '<input type="number" data-ancla="anio_inicio_id" value="' + c.anclas.anio_inicio_id + '"></label>' +
      '<label class="campo"><span>Inicio del uso del ID por pagos</span>' +
      '<input type="number" data-ancla="anio_inicio_reversos_pago" value="' + c.anclas.anio_inicio_reversos_pago + '"></label>' +
      '</div></div></div>';

    h += '<div class="tarjeta"><header><h2>Opciones de calculo</h2>' +
      '<div class="der"><span class="nota mini">Interpretaciones parametrizables de reglas ambiguas del Excel</span>' +
      '</div></header><div class="cuerpo"><div class="rejilla c2">';
    h += '<label class="campo"><span>Saldos usados en ingreso gravado / no gravado (pasos 9 y 10)</span>' +
      '<select data-opcion="base_saldos_salida">' +
      '<option value="ANIO_ANTERIOR"' + (c.opciones.base_saldos_salida === 'ANIO_ANTERIOR' ? ' selected' : '') +
      '>Saldo acumulado al anio anterior</option>' +
      '<option value="ANIO_CORRIENTE"' + (c.opciones.base_saldos_salida === 'ANIO_CORRIENTE' ? ' selected' : '') +
      '>Saldo del anio corriente</option></select>' +
      '<span class="nota mini">En el anio de salida el pasivo final es 0, por lo que el saldo no deducible de ese anio ' +
      'tambien seria 0. Por defecto se usa el saldo del anio anterior.</span></label>';
    h += '<label class="campo"><span>Signo de la reversion del AID (pasos 26 y 27)</span>' +
      '<select data-opcion="signo_reversion_aid">' +
      '<option value="NEGATIVO"' + (c.opciones.signo_reversion_aid === 'NEGATIVO' ? ' selected' : '') +
      '>Reversion negativa, se suma al saldo</option>' +
      '<option value="POSITIVO"' + (c.opciones.signo_reversion_aid === 'POSITIVO' ? ' selected' : '') +
      '>Reversion positiva, se resta del saldo</option></select>' +
      '<span class="nota mini">El Excel (D65/D66) suma la reversion; ambas alternativas dan el mismo saldo.</span></label>';
    h += '<label class="campo"><span>Origen del saldo del anio base (paso 13)</span>' +
      '<select data-opcion="origen_saldo_anio_base">' +
      '<option value="SALDO_DEDUCIBLE"' + (c.opciones.origen_saldo_anio_base === 'SALDO_DEDUCIBLE' ? ' selected' : '') +
      '>Saldo deducible al 31-12 del anio base</option>' +
      '<option value="SALDO_NO_DEDUCIBLE"' + (c.opciones.origen_saldo_anio_base === 'SALDO_NO_DEDUCIBLE' ? ' selected' : '') +
      '>Saldo no deducible al 31-12 del anio base</option></select></label>';
    h += '<label class="campo"><span>Pasivo final</span>' +
      '<select data-opcion="pasivo_final_desde_archivo">' +
      '<option value="1"' + (c.opciones.pasivo_final_desde_archivo ? ' selected' : '') +
      '>Tomar del archivo y usar la formula como control</option>' +
      '<option value="0"' + (!c.opciones.pasivo_final_desde_archivo ? ' selected' : '') +
      '>Calcular siempre con la formula de movimiento</option></select></label>';
    h += '<label class="campo"><span>Tolerancia de conciliacion</span>' +
      '<input type="number" step="0.01" data-opcion-num="tolerancia_conciliacion" value="' +
      c.opciones.tolerancia_conciliacion + '"></label>';
    h += '<label class="campo"><span>Umbral de similitud de nombres (0 a 1)</span>' +
      '<input type="number" step="0.01" min="0.5" max="1" data-opcion-num="umbral_similitud_nombres" value="' +
      c.opciones.umbral_similitud_nombres + '"></label>';
    h += '</div></div></div>';

    /* Fondeo y clasificacion contable por anio */
    h += '<div class="tarjeta"><header><h2>Fondeo y clasificacion contable por anio</h2></header><div class="cuerpo">' +
      '<p class="nota" style="margin-bottom:10px">El fondeo solo incide en JP 2021 (reglas JP-04 y JP-05). ' +
      'La clasificacion contable indica si las perdidas y ganancias actuariales se registraron en ERI o en ORI ' +
      '(paso 6, celda D29); dejela vacia si no hay evidencia.</p><div class="scroll-x"><table class="datos"><thead><tr>' +
      '<th>Anio</th><th>Fondeo del fondo de JP</th><th>Registro de P&amp;G actuariales</th></tr></thead><tbody>';
    anios.forEach(function (a) {
      var fo = c.fondeo[a];
      var cl = c.clasificacion_pg_actuarial[a] || '';
      h += '<tr><td><b>' + a + '</b></td>' +
        '<td><select data-fondeo="' + a + '">' +
        '<option value=""' + (fo === undefined || fo === null ? ' selected' : '') + '>(no definido)</option>' +
        '<option value="1"' + (fo === true ? ' selected' : '') + '>Con fondeo</option>' +
        '<option value="0"' + (fo === false ? ' selected' : '') + '>Sin fondeo</option></select></td>' +
        '<td><select data-clasif="' + a + '">' +
        '<option value=""' + (!cl ? ' selected' : '') + '>(sin evidencia)</option>' +
        '<option value="ERI"' + (cl === 'ERI' ? ' selected' : '') + '>ERI</option>' +
        '<option value="ORI"' + (cl === 'ORI' ? ' selected' : '') + '>ORI</option></select></td></tr>';
    });
    h += '</tbody></table></div>' +
      '<label class="fila" style="margin-top:10px"><input type="checkbox" data-accion="fondeo-supuesto"' +
      (c.fondeo_es_supuesto ? ' checked' : '') + '> <span class="nota">Marcar el fondeo como supuesto por defecto ' +
      '(genera alerta informativa mientras no se confirme).</span></label></div></div>';

    /* Reglas */
    ['JP', 'BD'].forEach(function (reg) {
      var lista = reg === 'JP' ? c.reglas_jp : c.reglas_bd;
      h += '<div class="tarjeta"><header><h2>Reglas tributarias · ' +
        (reg === 'JP' ? 'Jubilacion Patronal' : 'Bonificacion por Desahucio') + '</h2>' +
        '<div class="der"><button class="btn mini" data-accion="regla-nueva" data-reg="' + reg + '">Agregar regla</button>' +
        '</div></header><div class="tabla-caja"><table class="datos"><thead><tr>' +
        '<th>Id</th><th class="num">Desde</th><th class="num">Hasta</th><th class="num">TS min</th>' +
        '<th class="num">TS max</th><th>Fondeo</th><th>Deducible</th><th>Considera ID</th><th>Estado</th>' +
        '<th>Nota / fuente</th><th></th></tr></thead><tbody>';
      lista.forEach(function (r, i) {
        function inp(campo, tipo) {
          return '<input type="' + tipo + '" data-regla="' + reg + '" data-i="' + i + '" data-campo="' + campo +
            '" value="' + (r[campo] === null || r[campo] === undefined ? '' : esc(r[campo])) +
            '" style="width:' + (tipo === 'number' ? '68' : '90') + 'px">';
        }
        function sel(campo, opts) {
          var s = '<select data-regla="' + reg + '" data-i="' + i + '" data-campo="' + campo + '">';
          opts.forEach(function (o) {
            s += '<option value="' + o[0] + '"' + (String(r[campo]) === String(o[0]) ? ' selected' : '') +
              '>' + o[1] + '</option>';
          });
          return s + '</select>';
        }
        h += '<tr><td><b>' + esc(r.id) + '</b></td>' +
          '<td class="num">' + inp('desde', 'number') + '</td>' +
          '<td class="num">' + inp('hasta', 'number') + '</td>' +
          '<td class="num">' + inp('ts_min', 'number') + '</td>' +
          '<td class="num">' + inp('ts_max', 'number') + '</td>' +
          '<td>' + sel('fondeo', [['null', 'indiferente'], ['true', 'con fondeo'], ['false', 'sin fondeo']]) + '</td>' +
          '<td>' + sel('deducible', [['true', 'Deducible'], ['false', 'No deducible']]) + '</td>' +
          '<td>' + sel('impuesto_diferido', [['true', 'Si'], ['false', 'No']]) + '</td>' +
          '<td>' + sel('estado', [['CONFIRMADA', 'Confirmada'], ['PENDIENTE_CONSULTA', 'Consulta vinculante'],
            ['PENDIENTE_DEFINIR', 'Por definir']]) + '</td>' +
          '<td style="white-space:normal;max-width:340px"><span class="nota">' + esc(r.nota) + '</span>' +
          (r.fuente ? '<br><span class="nota mini">' + esc(r.fuente) + '</span>' : '') + '</td>' +
          '<td><button class="btn mini peligro" data-accion="regla-borrar" data-reg="' + reg +
          '" data-i="' + i + '">×</button></td></tr>';
      });
      h += '</tbody></table></div></div>';
    });

    h += '<div class="tarjeta"><header><h2>Respaldo de la configuracion</h2></header><div class="cuerpo"><div class="fila">' +
      '<button class="btn" data-accion="cfg-exportar">Exportar parametros (.json)</button>' +
      '<button class="btn" data-accion="cfg-importar">Importar parametros (.json)</button>' +
      '<button class="btn peligro" data-accion="cfg-reset">Restablecer valores del Excel</button>' +
      '</div><p class="nota" style="margin-top:10px">Los parametros se guardan en este navegador. ' +
      'Exportelos para versionarlos junto al expediente del cliente.</p></div></div>';
    return h;
  }

  /* ====================================================================== *
   * PANTALLA: PROCESAMIENTO
   * ====================================================================== */
  function vistaProceso() {
    var listo = S.actuariales.length > 0;
    var h = '';
    if (!listo) {
      h += '<div class="aviso crit"><b>Falta informacion actuarial</b>' +
        'Cargue el detalle de empleados antes de ejecutar el analisis.</div>';
    }
    h += '<div class="tarjeta"><header><h2>Ejecutar analisis</h2></header><div class="cuerpo">';
    h += '<div class="rejilla c4" style="margin-bottom:16px">' +
      '<div class="kpi"><div class="et">Registros actuariales</div><div class="v">' + fmt0(S.actuariales.length) + '</div></div>' +
      '<div class="kpi"><div class="et">Lineas de resumen</div><div class="v">' + fmt0(S.resumenes.length) + '</div></div>' +
      '<div class="kpi"><div class="et">Respaldo contable</div><div class="v">' + fmt0(S.contables.length) + '</div></div>' +
      '<div class="kpi"><div class="et">Fusiones confirmadas</div><div class="v">' + fmt0(Object.keys(S.fusiones).length) + '</div></div>' +
      '</div>';
    h += '<button class="btn pri grande" data-accion="ejecutar"' + (listo ? '' : ' disabled') + '>EJECUTAR ANALISIS</button>';
    h += '<div id="prog" style="margin-top:16px;display:none">' +
      '<div class="progreso"><i></i></div><p class="nota" id="prog-txt" style="margin-top:6px"></p></div>';
    h += '</div></div>';

    if (S.resultado) {
      var res = APP.Validaciones.resumen(S.alertas);
      h += '<div class="aviso ok"><b>Analisis ejecutado</b>' +
        fmt0(S.resultado.filas.length) + ' registros calculados sobre ' + fmt0(S.resultado.empleados.length) +
        ' empleados y ' + S.resultado.anios.length + ' anios. ' +
        res.CRITICA + ' alertas criticas, ' + res.ADVERTENCIA + ' advertencias, ' +
        res.INFORMATIVA + ' informativas.</div>';
      h += '<div class="fila"><button class="btn pri" data-ir="resultados">Ver resultados</button>' +
        '<button class="btn" data-ir="alertas">Revisar alertas</button>' +
        '<button class="btn" data-ir="exportar">Exportar a Excel</button></div>';
    }
    return h;
  }

  function ejecutar() {
    var caja = $('#prog'), barra = $('#prog i'), txt = $('#prog-txt');
    if (caja) caja.style.display = 'block';
    function pr(p, m) {
      if (barra) barra.style.width = p + '%';
      if (txt) txt.textContent = m;
    }
    pr(2, 'Preparando...');
    setTimeout(function () {
      try {
        S.resultado = APP.Motor.ejecutar({
          actuariales: S.actuariales, resumenes: S.resumenes, contables: S.contables,
          fusiones: S.fusiones, overrides: S.overrides
        }, S.cfg, pr);
        pr(88, 'Conciliando contra los resumenes actuariales...');
        S.conciliaciones = APP.Conciliacion.calcular(S.resultado, S.resumenes, S.cfg);
        pr(94, 'Generando alertas...');
        S.alertas = APP.Validaciones.construir(S.resultado, S.cfg, S.conciliaciones);
        pr(100, 'Listo.');
        toast('Analisis completado: ' + fmt0(S.resultado.filas.length) + ' registros', 'ok');
        S.pantalla = 'resultados'; S.sub = 'unificado';
        pintar();
      } catch (e) {
        console.error(e);
        toast('Error durante el analisis: ' + (e.message || e), 'error');
        pr(0, 'Error: ' + (e.message || e));
      }
    }, 50);
  }

  APP.UI_INTERNO = { vistaDashboard: vistaDashboard };

  /* Las vistas de resultados, alertas, traza, pruebas, exportacion y seguridad
     se definen en el modulo 12-ui-resultados.js y se registran en VISTAS. */
  var VISTAS = {
    dashboard: vistaDashboard,
    carga: vistaCarga,
    homologacion: vistaHomologacion,
    parametros: vistaParametros,
    proceso: vistaProceso
  };

  /* ====================================================================== *
   * EVENTOS
   * ====================================================================== */
  function guardar() { APP.guardarConfig(S.cfg); }

  function manejarClick(ev) {
    var t = ev.target.closest('[data-ir],[data-accion],[data-cargar]');
    if (!t) {
      if (ev.target.hasAttribute && ev.target.hasAttribute('data-cerrar-fondo')) {
        S.pendiente = null; $('#modal').innerHTML = '';
      }
      return;
    }
    if (t.hasAttribute('data-ir')) { ir(t.getAttribute('data-ir')); return; }
    if (t.hasAttribute('data-cargar')) { elegirArchivo(t.getAttribute('data-cargar')); return; }

    var a = t.getAttribute('data-accion');
    if (APP.UI_ACCIONES && APP.UI_ACCIONES[a]) { APP.UI_ACCIONES[a](t, ev); return; }

    switch (a) {
      case 'cerrar-modal': S.pendiente = null; $('#modal').innerHTML = ''; break;
      case 'confirmar-mapeo': confirmarMapeo(); break;
      case 'ejecutar': ejecutar(); break;
      case 'limpiar-archivos':
        if (confirm('Se eliminaran todos los registros cargados en esta sesion. Continuar?')) {
          S.archivos = []; S.actuariales = []; S.resumenes = []; S.contables = [];
          S.resultado = null; S.alertas = []; S.conciliaciones = [];
          toast('Informacion eliminada de la memoria', 'ok'); pintar();
        }
        break;
      case 'plantillas': APP.Plantillas.descargar(); break;
      case 'fusionar':
        S.fusiones[t.getAttribute('data-a')] = t.getAttribute('data-b');
        toast('Empleados fusionados. Vuelva a ejecutar el analisis.', 'ok'); pintar();
        break;
      case 'quitar-fusion': delete S.fusiones[t.getAttribute('data-a')]; pintar(); break;
      case 'deshacer-fusiones': S.fusiones = {}; pintar(); break;
      case 'tarifa-masiva': {
        var v = $('#tarifa-masiva').value;
        if (v === '') { toast('Indique un porcentaje', 'error'); break; }
        var anios = S.resultado ? S.resultado.anios : Object.keys(
          S.actuariales.reduce(function (m, r) { if (r.anio) m[r.anio] = 1; return m; }, {})).map(Number);
        anios.forEach(function (an) { S.cfg.tarifas_ir[an] = Number(v) / 100; });
        guardar(); toast('Tarifa aplicada a ' + anios.length + ' anios', 'ok'); pintar();
        break;
      }
      case 'anios-todos':
        S.cfg.anios.inicio = null; S.cfg.anios.fin = null;
        guardar(); toast('Se analizaran todos los anios cargados', 'ok'); pintar();
        break;
      case 'regla-nueva': {
        var reg = t.getAttribute('data-reg');
        var lista = reg === 'JP' ? S.cfg.reglas_jp : S.cfg.reglas_bd;
        lista.push({
          id: reg + '-' + String(lista.length + 1).padStart(2, '0'), regimen: reg,
          desde: null, hasta: null, ts_min: null, ts_max: null, fondeo: null,
          deducible: false, impuesto_diferido: false, estado: 'PENDIENTE_DEFINIR',
          nota: 'Regla agregada por el usuario. Completar y documentar la base normativa.', fuente: 'Usuario'
        });
        guardar(); pintar(); break;
      }
      case 'regla-borrar': {
        var rg = t.getAttribute('data-reg'), i = Number(t.getAttribute('data-i'));
        var lst = rg === 'JP' ? S.cfg.reglas_jp : S.cfg.reglas_bd;
        if (confirm('Eliminar la regla ' + lst[i].id + '?')) { lst.splice(i, 1); guardar(); pintar(); }
        break;
      }
      case 'cfg-exportar': {
        var blob = new Blob([JSON.stringify(S.cfg, null, 2)], { type: 'application/json' });
        var url = URL.createObjectURL(blob);
        var link = document.createElement('a');
        link.href = url; link.download = 'parametros-anexo-jp-bd.json'; link.click();
        setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
        break;
      }
      case 'cfg-importar': {
        var inp = document.createElement('input');
        inp.type = 'file'; inp.accept = '.json';
        inp.onchange = function () {
          var fr = new FileReader();
          fr.onload = function (e) {
            try {
              var g = JSON.parse(e.target.result);
              localStorage.setItem(APP.CONFIG_KEY, JSON.stringify(g));
              S.cfg = APP.cargarConfig();
              toast('Parametros importados', 'ok'); pintar();
            } catch (err) { toast('Archivo de parametros invalido', 'error'); }
          };
          fr.readAsText(inp.files[0]);
        };
        inp.click(); break;
      }
      case 'cfg-reset':
        if (confirm('Se restableceran los parametros y reglas a los valores del Excel original. Continuar?')) {
          APP.borrarConfig(); S.cfg = APP.cargarConfig(); toast('Parametros restablecidos', 'ok'); pintar();
        }
        break;
    }
  }

  function manejarCambio(ev) {
    var e = ev.target;

    if (e.hasAttribute('data-filtro')) {
      S.filtro[e.getAttribute('data-filtro')] = e.value;
      pintar(); return;
    }
    if (e.hasAttribute('data-tarifa')) {
      var an = e.getAttribute('data-tarifa');
      if (e.value === '') delete S.cfg.tarifas_ir[an];
      else S.cfg.tarifas_ir[an] = Number(e.value) / 100;
      guardar(); return;
    }
    if (e.hasAttribute('data-ancla')) {
      S.cfg.anclas[e.getAttribute('data-ancla')] = Number(e.value); guardar(); return;
    }
    if (e.hasAttribute('data-anios')) {
      S.cfg.anios[e.getAttribute('data-anios')] = e.value === '' ? null : Number(e.value);
      guardar(); return;
    }
    if (e.hasAttribute('data-opcion')) {
      var k = e.getAttribute('data-opcion');
      S.cfg.opciones[k] = (k === 'pasivo_final_desde_archivo') ? e.value === '1' : e.value;
      guardar(); return;
    }
    if (e.hasAttribute('data-opcion-num')) {
      S.cfg.opciones[e.getAttribute('data-opcion-num')] = Number(e.value); guardar(); return;
    }
    if (e.hasAttribute('data-fondeo')) {
      var y = e.getAttribute('data-fondeo');
      if (e.value === '') delete S.cfg.fondeo[y]; else S.cfg.fondeo[y] = e.value === '1';
      guardar(); return;
    }
    if (e.hasAttribute('data-clasif')) {
      var y2 = e.getAttribute('data-clasif');
      if (e.value === '') delete S.cfg.clasificacion_pg_actuarial[y2];
      else S.cfg.clasificacion_pg_actuarial[y2] = e.value;
      guardar(); return;
    }
    if (e.hasAttribute('data-regla')) {
      var lista = e.getAttribute('data-regla') === 'JP' ? S.cfg.reglas_jp : S.cfg.reglas_bd;
      var r = lista[Number(e.getAttribute('data-i'))];
      var campo = e.getAttribute('data-campo');
      var v = e.value;
      if (['desde', 'hasta', 'ts_min', 'ts_max'].indexOf(campo) >= 0) r[campo] = v === '' ? null : Number(v);
      else if (['deducible', 'impuesto_diferido'].indexOf(campo) >= 0) r[campo] = v === 'true';
      else if (campo === 'fondeo') r[campo] = v === 'null' ? null : v === 'true';
      else r[campo] = v;
      guardar(); return;
    }
    if (e.hasAttribute('data-map')) {
      var p = S.pendiente; if (!p) return;
      var campo2 = e.getAttribute('data-map');
      if (campo2 === 'hoja') { p.iHoja = Number(e.value); p.filaEnc = null; recalcularMapeo(); }
      else if (campo2 === 'filaEnc') { p.filaEnc = Math.max(0, Number(e.value) - 1); recalcularMapeo(); }
      else p[campo2] = e.value;
      pintarMapeo(); return;
    }
    if (e.hasAttribute('data-col')) {
      var p2 = S.pendiente; if (!p2) return;
      var ci = Number(e.getAttribute('data-col'));
      Object.keys(p2.mapa).forEach(function (c) { if (p2.mapa[c] === ci) delete p2.mapa[c]; });
      if (e.value) p2.mapa[e.value] = ci;
      pintarMapeo(); return;
    }
    if (e.getAttribute('data-accion') === 'fondeo-supuesto') {
      S.cfg.fondeo_es_supuesto = e.checked; guardar(); return;
    }
    if (APP.UI_CAMBIOS) APP.UI_CAMBIOS(ev);
  }

  /* ====================================================================== *
   * ARRANQUE
   * ====================================================================== */
  function iniciar() {
    S.cfg = APP.cargarConfig();
    document.addEventListener('click', manejarClick);
    document.addEventListener('change', manejarCambio);
    document.addEventListener('input', function (ev) {
      if (ev.target.hasAttribute && ev.target.hasAttribute('data-filtro') &&
          ev.target.getAttribute('data-filtro') === 'texto') {
        clearTimeout(iniciar._t);
        var v = ev.target.value;
        iniciar._t = setTimeout(function () {
          S.filtro.texto = v;
          pintar();
          var inp = document.querySelector('[data-filtro="texto"]');
          if (inp) { inp.focus(); inp.setSelectionRange(v.length, v.length); }
        }, 320);
      }
    });
    pintar();
  }

  return {
    iniciar: iniciar, pintar: pintar, ir: ir, S: S, VISTAS: VISTAS,
    tabla: tabla, esc: esc, fmt: fmt, fmt0: fmt0, pct: pct, suma: suma, toast: toast,
    barraFiltros: barraFiltros, filas: filas, guardar: guardar,
    tagSev: tagSev, tagStatus: tagStatus, tagEstado: tagEstado, $: $
  };
})();
