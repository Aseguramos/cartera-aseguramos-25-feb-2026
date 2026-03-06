import React, { useEffect, useMemo, useRef, useState } from "react";
import { db, auth } from "./firebase";

import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  where,
} from "firebase/firestore";

import { onAuthStateChanged } from "firebase/auth";

function getSemaforo(poliza) {
  if ((poliza.endoso || "") === "") return "rojo";

  const baseCompleta =
    !!poliza.montada && !!poliza.recaudada && !!poliza.firmada && !!poliza.desembolsada;

  const baseParcial =
    !!poliza.montada || !!poliza.recaudada || !!poliza.firmada || !!poliza.desembolsada;

  if (!!poliza.delegada) {
    if ((poliza.endoso || "") === "SI") {
      if (baseCompleta && !!poliza.certificacion && !!poliza.correoEndoso) return "verde";
    } else {
      if (baseCompleta) return "verde";
    }
    return "amarillo";
  }

  if ((poliza.endoso || "") === "SI") {
    if (baseCompleta && !!poliza.certificacion && !!poliza.correoEndoso) return "verde";
    if (baseParcial || !!poliza.certificacion) return "amarillo";
    return "rojo";
  }

  if (baseCompleta) return "verde";
  if (baseParcial) return "amarillo";

  return "rojo";
}

function inRangeISO(dateISO, desdeISO, hastaISO) {
  const d = (dateISO || "").trim();
  if (!d) return false;
  if (desdeISO && d < desdeISO) return false;
  if (hastaISO && d > hastaISO) return false;
  return true;
}

// ✅ DÍAS TRANSCURRIDOS DESDE LA FECHA
function diasDesdeFecha(fechaISO) {
  if (!fechaISO) return null;

  const [y, m, d] = fechaISO.split("-").map(Number);
  if (!y || !m || !d) return null;

  const fecha = new Date(y, m - 1, d);
  const hoy = new Date();

  const fecha0 = new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate());
  const hoy0 = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());

  return Math.floor((hoy0.getTime() - fecha0.getTime()) / (1000 * 60 * 60 * 24));
}

// ✅ SEMÁFORO SEGÚN DÍAS TRANSCURRIDOS
function getSemaforoFecha(poliza) {
  const dias = diasDesdeFecha(poliza.fecha);

  if (dias === null) return "sin_fecha";

  // Si ya está finalizada, queda tranquila
  if (getSemaforo(poliza) === "verde") return "tranquila";

  // 0 a 2 días transcurridos
  if (dias <= 2) return "tranquila";

  // 3 a 5 días transcurridos
  if (dias >= 3 && dias <= 5) return "proxima";

  // 6 días o más transcurridos
  return "urgente";
}

export default function PolizasFinanciadas() {
  const entidadesLista = [
    "Finesa",
    "Previcredito",
    "Crediestado",
    "Credivalores",
    "ALLIANZ",
    "ESTADO",
    "SURA",
    "MUNDIAL",
    "PREVISORA",
    "AXA COLPATRIA",
    "MAPFRE",
    "SBS",
    "SOLIDARIA",
    "HDI",
  ];

  const aseguradorasLista = [
    "ALLIANZ",
    "ESTADO",
    "SURA",
    "MUNDIAL",
    "PREVISORA",
    "AXA COLPATRIA",
    "MAPFRE",
    "SBS",
    "SOLIDARIA",
    "HDI",
  ];

  const [polizas, setPolizas] = useState([]);
  const [uid, setUid] = useState(null);
  const [authReady, setAuthReady] = useState(false);

  // filtros
  const [filtroSemaforo, setFiltroSemaforo] = useState("todas");
  const [fechaDesde, setFechaDesde] = useState("");
  const [fechaHasta, setFechaHasta] = useState("");
  const [soloBloqueadas, setSoloBloqueadas] = useState(false);

  // filtro por vencimiento
  const [filtroVencimiento, setFiltroVencimiento] = useState("todas");

  // ✅ NUEVO: buscador
  const [busqueda, setBusqueda] = useState("");

  const autolockProcesadas = useRef(new Set());

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setUid(user ? user.uid : null);
      setAuthReady(true);
      console.log("AUTH USER:", user?.email, "UID:", user?.uid);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!uid) {
      setPolizas([]);
      return;
    }

    const ref = query(
      collection(db, "cartera", uid, "polizasFinanciadas"),
      where("tipo", "==", "financiada")
    );

    const unsubscribe = onSnapshot(
      ref,
      (snap) => {
        const datos = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setPolizas(datos);
      },
      (err) => {
        console.error("❌ onSnapshot financiadas (subcolección UID):", err);
        alert("No se pudo leer pólizas financiadas. Revisa reglas/permisos.");
      }
    );

    return () => unsubscribe();
  }, [uid]);

  const plantillaNueva = () => ({
    numeroPoliza: "",
    fecha: "",
    placa: "",
    nombre: "",
    entidad: "Finesa",
    aseguradora: "SURA",
    gestor: "",
    cuotas: 1,
    valor: "",
    montada: false,
    recaudada: false,
    firmada: false,
    endoso: "",
    certificacion: false,
    correoEndoso: false,
    desembolsada: false,
    delegada: false,
    delegadaA: "",
    gestionTexto: "",
    tipo: "financiada",
    createdAt: Date.now(),
    bloqueada: false,
  });

  const agregarPoliza = async () => {
    if (!uid) return;
    try {
      await addDoc(collection(db, "cartera", uid, "polizasFinanciadas"), plantillaNueva());
    } catch (error) {
      console.error("❌ Error creando póliza financiada:", error);
      alert("Error creando póliza. Revisa consola y permisos/reglas.");
    }
  };

  const guardarCampo = async (id, patch) => {
    if (!uid) return;
    try {
      await updateDoc(doc(db, "cartera", uid, "polizasFinanciadas", id), patch);
    } catch (error) {
      console.error("❌ Error guardando cambio:", error);
      alert("No se pudo guardar. Revisa permisos/reglas o conexión.");
    }
  };

  const eliminarPoliza = async (id) => {
    const ok = window.confirm("¿Seguro que quieres eliminar esta póliza financiada?");
    if (!ok || !uid) return;

    try {
      await deleteDoc(doc(db, "cartera", uid, "polizasFinanciadas", id));
    } catch (error) {
      console.error("❌ Error eliminando póliza:", error);
      alert("No se pudo eliminar. Revisa permisos/reglas o conexión.");
    }
  };

  const borrarTodo = async (dataRender) => {
    const ok = window.confirm("⚠️ Esto eliminará TODAS las pólizas financiadas visibles. ¿Continuar?");
    if (!ok || !uid) return;

    try {
      for (const p of dataRender) {
        if (p.bloqueada) continue;
        await deleteDoc(doc(db, "cartera", uid, "polizasFinanciadas", p.id));
      }
    } catch (error) {
      console.error("❌ Error borrando todo:", error);
      alert("No se pudo borrar todo. Revisa permisos/reglas o conexión.");
    }
  };

  const sinSesion = authReady && !uid;

  const dataRender = useMemo(() => {
    let arr = polizas;

    if (filtroSemaforo !== "todas") {
      arr = arr.filter((p) => getSemaforo(p) === filtroSemaforo);
    }

    if (fechaDesde || fechaHasta) {
      arr = arr.filter((p) => inRangeISO(p.fecha, fechaDesde, fechaHasta));
    }

    if (soloBloqueadas) {
      arr = arr.filter((p) => !!p.bloqueada);
    }

    if (filtroVencimiento !== "todas") {
      arr = arr.filter((p) => getSemaforoFecha(p) === filtroVencimiento);
    }

    // ✅ NUEVO: buscador por póliza, placa, nombre, gestor y delegado
    if (busqueda.trim() !== "") {
      const b = busqueda.toLowerCase();

      arr = arr.filter((p) =>
        (p.numeroPoliza || "").toLowerCase().includes(b) ||
        (p.placa || "").toLowerCase().includes(b) ||
        (p.nombre || "").toLowerCase().includes(b) ||
        (p.gestor || "").toLowerCase().includes(b) ||
        (p.delegadaA || "").toLowerCase().includes(b)
      );
    }

    // ordenar por fecha: más antigua primero
    arr = [...arr].sort((a, b) => {
      const fa = a.fecha || "";
      const fb = b.fecha || "";

      if (!fa && !fb) return 0;
      if (!fa) return 1;
      if (!fb) return -1;

      return fa.localeCompare(fb);
    });

    return arr;
  }, [
    polizas,
    filtroSemaforo,
    fechaDesde,
    fechaHasta,
    soloBloqueadas,
    filtroVencimiento,
    busqueda,
  ]);

  const contadores = useMemo(() => {
    const total = polizas.length;

    const rojas = polizas.filter((p) => getSemaforo(p) === "rojo").length;
    const amarillas = polizas.filter((p) => getSemaforo(p) === "amarillo").length;
    const verdes = polizas.filter((p) => getSemaforo(p) === "verde").length;

    const montadas = polizas.filter((p) => !!p.montada).length;
    const recaudadas = polizas.filter((p) => !!p.recaudada).length;
    const firmadas = polizas.filter((p) => !!p.firmada).length;
    const desembolsadas = polizas.filter((p) => !!p.desembolsada).length;

    const endosoSi = polizas.filter((p) => (p.endoso || "") === "SI").length;

    const certPend = polizas.filter(
      (p) => (p.endoso || "") === "SI" && !!p.desembolsada && !p.certificacion
    ).length;

    const correoPend = polizas.filter(
      (p) => (p.endoso || "") === "SI" && !!p.certificacion && !p.correoEndoso
    ).length;

    const bloqueadas = polizas.filter((p) => !!p.bloqueada).length;

    const urgentes = polizas.filter((p) => getSemaforoFecha(p) === "urgente").length;
    const proximas = polizas.filter((p) => getSemaforoFecha(p) === "proxima").length;
    const tranquilas = polizas.filter((p) => getSemaforoFecha(p) === "tranquila").length;
    const sinFecha = polizas.filter((p) => getSemaforoFecha(p) === "sin_fecha").length;

    return {
      total,
      rojas,
      amarillas,
      verdes,
      montadas,
      recaudadas,
      firmadas,
      desembolsadas,
      endosoSi,
      certPend,
      correoPend,
      bloqueadas,
      urgentes,
      proximas,
      tranquilas,
      sinFecha,
    };
  }, [polizas]);

  useEffect(() => {
    if (!uid) return;

    const verdesNoBloqueadas = polizas.filter(
      (p) => getSemaforo(p) === "verde" && !p.bloqueada
    );

    if (verdesNoBloqueadas.length === 0) return;

    verdesNoBloqueadas.forEach(async (p) => {
      if (autolockProcesadas.current.has(p.id)) return;
      autolockProcesadas.current.add(p.id);

      try {
        await updateDoc(doc(db, "cartera", uid, "polizasFinanciadas", p.id), {
          bloqueada: true,
          bloqueadaAt: Date.now(),
        });
      } catch (e) {
        console.error("❌ Error auto-bloqueando póliza:", p.id, e);
        autolockProcesadas.current.delete(p.id);
      }
    });
  }, [polizas, uid]);

  const toggleBloqueo = async (p, nuevoEstado) => {
    if (!uid) return;

    if (!nuevoEstado) {
      const ok = window.confirm("¿Desbloquear esta fila? (podrás editar y desmarcar)");
      if (!ok) return;
    }

    try {
      await updateDoc(doc(db, "cartera", uid, "polizasFinanciadas", p.id), {
        bloqueada: nuevoEstado,
        bloqueadaAt: nuevoEstado ? (p.bloqueadaAt || Date.now()) : null,
      });
    } catch (e) {
      console.error("❌ Error cambiando bloqueo:", e);
      alert("No se pudo cambiar el bloqueo. Revisa permisos/conexión.");
    }
  };

  const limpiarFechas = () => {
    setFechaDesde("");
    setFechaHasta("");
  };

  return (
    <div className="pl-0 pr-4 pt-4 pb-4 w-full text-left">
      <h2 className="text-xl font-bold mb-2">Pólizas Financiadas</h2>

      {!authReady && <div className="text-sm text-gray-500 mb-3">Cargando sesión…</div>}
      {sinSesion && (
        <div className="text-sm text-red-600 mb-3">
          Sin sesión activa. Inicia sesión para ver/agregar pólizas.
        </div>
      )}

      {/* CONTADORES + FILTROS SEMÁFORO PROCESO */}
      <div className="flex flex-wrap gap-2 items-center mb-3">
        <div className="bg-indigo-200 text-indigo-900 px-4 py-2 rounded shadow">
          <b>Total:</b> {contadores.total}
        </div>

        <div className="bg-gray-200 text-gray-900 px-4 py-2 rounded shadow">
          🔒 <b>Bloqueadas:</b> {contadores.bloqueadas}
        </div>

        <button
          onClick={() => setFiltroSemaforo("rojo")}
          className={`px-4 py-2 rounded shadow text-white ${
            filtroSemaforo === "rojo" ? "bg-red-700" : "bg-red-500"
          }`}
          type="button"
        >
          Rojas: {contadores.rojas}
        </button>

        <button
          onClick={() => setFiltroSemaforo("amarillo")}
          className={`px-4 py-2 rounded shadow ${
            filtroSemaforo === "amarillo" ? "bg-yellow-500" : "bg-yellow-300"
          }`}
          type="button"
        >
          Amarillas: {contadores.amarillas}
        </button>

        <button
          onClick={() => setFiltroSemaforo("verde")}
          className={`px-4 py-2 rounded shadow text-white ${
            filtroSemaforo === "verde" ? "bg-green-700" : "bg-green-500"
          }`}
          type="button"
        >
          Verdes: {contadores.verdes}
        </button>

        <button
          onClick={() => {
            setFiltroSemaforo("todas");
            setSoloBloqueadas(false);
            setFiltroVencimiento("todas");
            setBusqueda("");
          }}
          className={`px-4 py-2 rounded shadow ${
            filtroSemaforo === "todas" &&
            !soloBloqueadas &&
            filtroVencimiento === "todas" &&
            busqueda === ""
              ? "bg-blue-700 text-white"
              : "bg-blue-100"
          }`}
          type="button"
        >
          Todas
        </button>

        <button
          onClick={() => setSoloBloqueadas((v) => !v)}
          className={`px-4 py-2 rounded shadow ${
            soloBloqueadas ? "bg-gray-800 text-white" : "bg-gray-200 text-gray-900"
          }`}
          type="button"
        >
          🔒 Solo Bloqueadas: {contadores.bloqueadas}
        </button>
      </div>

      {/* CONTADORES + FILTROS VENCIMIENTO */}
      <div className="flex flex-wrap gap-2 items-center mb-4">
        <button
          onClick={() => setFiltroVencimiento("urgente")}
          className={`px-4 py-2 rounded shadow text-white ${
            filtroVencimiento === "urgente" ? "bg-red-700" : "bg-red-500"
          }`}
          type="button"
        >
          🚨 Urgentes (6+ días): {contadores.urgentes}
        </button>

        <button
          onClick={() => setFiltroVencimiento("proxima")}
          className={`px-4 py-2 rounded shadow ${
            filtroVencimiento === "proxima" ? "bg-yellow-500" : "bg-yellow-300"
          }`}
          type="button"
        >
          ⏳ Próximas (3-5 días): {contadores.proximas}
        </button>

        <button
          onClick={() => setFiltroVencimiento("tranquila")}
          className={`px-4 py-2 rounded shadow text-white ${
            filtroVencimiento === "tranquila" ? "bg-green-700" : "bg-green-500"
          }`}
          type="button"
        >
          ✅ Tranquilas (0-2 días): {contadores.tranquilas}
        </button>

        <button
          onClick={() => setFiltroVencimiento("sin_fecha")}
          className={`px-4 py-2 rounded shadow text-white ${
            filtroVencimiento === "sin_fecha" ? "bg-gray-700" : "bg-gray-500"
          }`}
          type="button"
        >
          📅 Sin fecha: {contadores.sinFecha}
        </button>
      </div>

      {/* FILTROS DE FECHA + BUSCADOR */}
      <div className="flex flex-wrap gap-2 items-end mb-4">
        <div className="bg-white shadow rounded px-3 py-2 border">
          <div className="text-xs text-gray-600 mb-1">Filtrar</div>
          <div className="flex flex-wrap gap-2 items-center">
            <div className="flex flex-col">
              <label className="text-xs text-gray-500">Desde</label>
              <input
                type="date"
                value={fechaDesde}
                onChange={(e) => setFechaDesde(e.target.value)}
                className="border rounded px-2 py-1"
              />
            </div>

            <div className="flex flex-col">
              <label className="text-xs text-gray-500">Hasta</label>
              <input
                type="date"
                value={fechaHasta}
                onChange={(e) => setFechaHasta(e.target.value)}
                className="border rounded px-2 py-1"
              />
            </div>

            <button
              onClick={limpiarFechas}
              className="px-3 py-2 rounded bg-gray-100 border hover:bg-gray-200"
              type="button"
            >
              Limpiar fechas
            </button>

            <div className="flex flex-col">
              <label className="text-xs text-gray-500">Buscar</label>
              <input
                type="text"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                className="border rounded px-3 py-2 w-96"
                placeholder="Póliza, placa, nombre, gestor o delegado..."
              />
            </div>

            <div className="text-xs text-gray-600">
              Mostrando: <b>{dataRender.length}</b>
            </div>
          </div>
        </div>
      </div>

      {/* CONTADORES EXTRA */}
      <div className="flex flex-wrap gap-2 mb-4">
        <div className="bg-blue-100 px-3 py-2 rounded shadow">
          🔵 Montadas: <b>{contadores.montadas}</b>
        </div>
        <div className="bg-purple-100 px-3 py-2 rounded shadow">
          🟣 Recaudadas: <b>{contadores.recaudadas}</b>
        </div>
        <div className="bg-green-100 px-3 py-2 rounded shadow">
          🟢 Firmadas: <b>{contadores.firmadas}</b>
        </div>
        <div className="bg-emerald-100 px-3 py-2 rounded shadow">
          💰 Desembolsadas: <b>{contadores.desembolsadas}</b>
        </div>
        <div className="bg-gray-100 px-3 py-2 rounded shadow">
          📝 Endoso SI: <b>{contadores.endosoSi}</b>
        </div>
        <div className="bg-orange-100 px-3 py-2 rounded shadow">
          📄 Certif. pendientes: <b>{contadores.certPend}</b>
        </div>
        <div className="bg-orange-100 px-3 py-2 rounded shadow">
          📩 Correo endoso pend.: <b>{contadores.correoPend}</b>
        </div>
      </div>

      {/* BOTONES */}
      <div className="flex gap-3 mb-4">
        <button
          onClick={agregarPoliza}
          disabled={!uid}
          className={`px-4 py-2 rounded-lg text-white ${
            uid ? "bg-green-600" : "bg-green-300 cursor-not-allowed"
          }`}
        >
          + Póliza Nueva
        </button>

        <button
          onClick={() => borrarTodo(dataRender)}
          disabled={!uid || dataRender.length === 0}
          className={`px-4 py-2 rounded-lg text-white ${
            uid && dataRender.length > 0 ? "bg-red-600" : "bg-red-300 cursor-not-allowed"
          }`}
        >
          🗑 Borrar TODO (filtro actual)
        </button>
      </div>

      {/* TABLA */}
      <table className="w-full border table-auto -ml-64">
        <thead className="bg-gray-100">
          <tr>
            <th>Estado</th>
            <th>Fecha</th>
            <th>Vencimiento</th>
            <th>Póliza</th>
            <th>Aseguradora</th>
            <th>Placa</th>
            <th>Nombre</th>
            <th>Entidad</th>
            <th>Cuotas</th>
            <th>Valor</th>
            <th>Montada</th>
            <th>Recaudada</th>
            <th>Firmada</th>
            <th>Desemb.</th>
            <th>Endoso</th>
            <th>Certif.</th>
            <th>Correo Endoso</th>
            <th>Deleg.</th>
            <th>Delegada a</th>
            <th>Gestor</th>
            <th>Gestión (texto)</th>
            <th>Acción</th>
          </tr>
        </thead>

        <tbody>
          {dataRender.map((p) => {
            const estado = getSemaforo(p);
            const bloqueada = !!p.bloqueada;
            const venc = getSemaforoFecha(p);
            const dias = diasDesdeFecha(p.fecha);

            return (
              <tr
                key={p.id}
                className={`border-b ${bloqueada ? "opacity-70" : ""}`}
                title={bloqueada ? "Fila bloqueada (no editable)" : ""}
              >
                <td>
                  <div className="flex items-start gap-3">
                    <div>
                      <span
                        className={`inline-flex items-center justify-center w-9 h-9 rounded-full border-2 border-white shadow-lg ${
                          estado === "verde"
                            ? "bg-green-500"
                            : estado === "amarillo"
                            ? "bg-yellow-400"
                            : "bg-red-500"
                        } ${
                          p.endoso === "SI" && p.desembolsada && !p.certificacion
                            ? "animate-pulse"
                            : ""
                        }`}
                      />
                    </div>

                    <div className="flex flex-col gap-1">
                      {bloqueada ? (
                        <button
                          onClick={() => toggleBloqueo(p, false)}
                          className="text-xs px-2 py-1 rounded bg-gray-200 hover:bg-gray-300"
                          type="button"
                        >
                          🔓 Desbloquear
                        </button>
                      ) : (
                        <button
                          onClick={() => toggleBloqueo(p, true)}
                          className="text-xs px-2 py-1 rounded bg-gray-100 border hover:bg-gray-200"
                          type="button"
                        >
                          🔒 Bloquear
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-col gap-1 text-xs mt-2">
                    {p.montada && <span className="text-blue-600">🔵 Montada</span>}
                    {p.recaudada && <span className="text-purple-600">🟣 Recaudada</span>}
                    {p.firmada && <span className="text-green-600">🟢 Firmada</span>}
                    {p.desembolsada && <span className="text-green-700">💰 Desembolsada</span>}

                    {p.endoso === "SI" && !p.certificacion && p.desembolsada && (
                      <span className="text-orange-500">📄 Certificación pendiente</span>
                    )}

                    {p.endoso === "SI" && p.certificacion && !p.correoEndoso && (
                      <span className="text-orange-500">📩 Correo Endoso pendiente</span>
                    )}

                    {estado === "verde" && (
                      <span className="text-green-700 font-semibold">
                        ✔ PROCESO FINALIZADO {bloqueada ? "(BLOQUEADO)" : ""}
                      </span>
                    )}
                  </div>
                </td>

                <td>
                  <input
                    type="date"
                    value={p.fecha || ""}
                    disabled={bloqueada}
                    onChange={(e) => guardarCampo(p.id, { fecha: e.target.value })}
                    className={`border rounded px-2 py-1 ${bloqueada ? "bg-gray-100" : ""}`}
                  />
                </td>

                <td className="text-center">
                  {venc === "sin_fecha" && (
                    <span className="px-2 py-1 rounded bg-gray-200 text-gray-700 text-xs">
                      Sin fecha
                    </span>
                  )}
                  {venc === "urgente" && (
                    <span className="px-2 py-1 rounded bg-red-500 text-white text-xs">
                      Urgente {dias !== null ? `(${dias}d)` : ""}
                    </span>
                  )}
                  {venc === "proxima" && (
                    <span className="px-2 py-1 rounded bg-yellow-400 text-black text-xs">
                      Próxima {dias !== null ? `(${dias}d)` : ""}
                    </span>
                  )}
                  {venc === "tranquila" && (
                    <span className="px-2 py-1 rounded bg-green-500 text-white text-xs">
                      Tranquila {dias !== null ? `(${dias}d)` : ""}
                    </span>
                  )}
                </td>

                <td>
                  <input
                    value={p.numeroPoliza || ""}
                    disabled={bloqueada}
                    onChange={(e) => guardarCampo(p.id, { numeroPoliza: e.target.value })}
                    className={`border rounded px-2 py-1 w-28 ${bloqueada ? "bg-gray-100" : ""}`}
                  />
                </td>

                <td>
                  <select
                    value={p.aseguradora || "SURA"}
                    disabled={bloqueada}
                    onChange={(e) => guardarCampo(p.id, { aseguradora: e.target.value })}
                    className={`border rounded px-2 py-1 ${bloqueada ? "bg-gray-100" : ""}`}
                  >
                    {aseguradorasLista.map((a) => (
                      <option key={a}>{a}</option>
                    ))}
                  </select>
                </td>

                <td>
                  <input
                    value={p.placa || ""}
                    disabled={bloqueada}
                    onChange={(e) =>
                      guardarCampo(p.id, { placa: (e.target.value || "").toUpperCase() })
                    }
                    className={`border rounded px-2 py-1 w-24 ${bloqueada ? "bg-gray-100" : ""}`}
                  />
                </td>

                <td>
                  <input
                    value={p.nombre || ""}
                    disabled={bloqueada}
                    onChange={(e) => guardarCampo(p.id, { nombre: e.target.value })}
                    className={`border rounded px-2 py-1 w-32 ${bloqueada ? "bg-gray-100" : ""}`}
                  />
                </td>

                <td>
                  <select
                    value={p.entidad || "Finesa"}
                    disabled={bloqueada}
                    onChange={(e) => guardarCampo(p.id, { entidad: e.target.value })}
                    className={`border rounded px-2 py-1 ${bloqueada ? "bg-gray-100" : ""}`}
                  >
                    {entidadesLista.map((ent) => (
                      <option key={ent}>{ent}</option>
                    ))}
                  </select>
                </td>

                <td>
                  <select
                    value={Number(p.cuotas || 1)}
                    disabled={bloqueada}
                    onChange={(e) => guardarCampo(p.id, { cuotas: Number(e.target.value) })}
                    className={`border rounded px-2 py-1 ${bloqueada ? "bg-gray-100" : ""}`}
                  >
                    {[...Array(12)].map((_, i) => (
                      <option key={i + 1}>{i + 1}</option>
                    ))}
                  </select>
                </td>

                <td>
                  <input
                    value={p.valor || ""}
                    disabled={bloqueada}
                    onChange={(e) => guardarCampo(p.id, { valor: e.target.value })}
                    className={`border rounded px-2 py-1 w-28 ${bloqueada ? "bg-gray-100" : ""}`}
                  />
                </td>

                <td className="text-center">
                  <input
                    type="checkbox"
                    checked={!!p.montada}
                    disabled={bloqueada}
                    onChange={(e) => guardarCampo(p.id, { montada: e.target.checked })}
                  />
                </td>

                <td className="text-center">
                  <input
                    type="checkbox"
                    checked={!!p.recaudada}
                    disabled={bloqueada || !p.montada}
                    onChange={(e) => guardarCampo(p.id, { recaudada: e.target.checked })}
                  />
                </td>

                <td className="text-center">
                  <input
                    type="checkbox"
                    checked={!!p.firmada}
                    disabled={bloqueada || !p.recaudada}
                    onChange={(e) => guardarCampo(p.id, { firmada: e.target.checked })}
                  />
                </td>

                <td className="text-center">
                  <input
                    type="checkbox"
                    checked={!!p.desembolsada}
                    disabled={bloqueada || !p.montada || !p.recaudada || !p.firmada}
                    onChange={(e) => guardarCampo(p.id, { desembolsada: e.target.checked })}
                  />
                </td>

                <td className="text-center">
                  <select
                    value={p.endoso || ""}
                    disabled={bloqueada}
                    onChange={(e) => guardarCampo(p.id, { endoso: e.target.value })}
                    className={`border rounded px-1 ${bloqueada ? "bg-gray-100" : ""}`}
                  >
                    <option value="">-</option>
                    <option value="SI">SI</option>
                    <option value="NO">NO</option>
                  </select>
                </td>

                <td className="text-center">
                  {p.endoso === "SI" && (
                    <input
                      type="checkbox"
                      checked={!!p.certificacion}
                      disabled={bloqueada || !p.desembolsada}
                      onChange={(e) => guardarCampo(p.id, { certificacion: e.target.checked })}
                    />
                  )}
                </td>

                <td className="text-center">
                  {p.endoso === "SI" && p.certificacion && (
                    <select
                      value={p.correoEndoso ? "SI" : "NO"}
                      disabled={bloqueada}
                      onChange={(e) =>
                        guardarCampo(p.id, { correoEndoso: e.target.value === "SI" })
                      }
                      className={`border rounded px-1 ${bloqueada ? "bg-gray-100" : ""}`}
                    >
                      <option value="NO">NO</option>
                      <option value="SI">SI</option>
                    </select>
                  )}
                </td>

                <td className="text-center">
                  <input
                    type="checkbox"
                    checked={!!p.delegada}
                    disabled={bloqueada}
                    onChange={(e) => guardarCampo(p.id, { delegada: e.target.checked })}
                  />
                </td>

                <td>
                  <input
                    value={p.delegadaA || ""}
                    disabled={bloqueada}
                    onChange={(e) => guardarCampo(p.id, { delegadaA: e.target.value })}
                    className={`border rounded px-2 py-1 w-32 ${bloqueada ? "bg-gray-100" : ""}`}
                  />
                </td>

                <td>
                  <input
                    value={p.gestor || ""}
                    disabled={bloqueada}
                    onChange={(e) => guardarCampo(p.id, { gestor: e.target.value })}
                    className={`border rounded px-2 py-1 w-32 ${bloqueada ? "bg-gray-100" : ""}`}
                  />
                </td>

                <td>
                  <textarea
                    value={p.gestionTexto || ""}
                    disabled={bloqueada}
                    onChange={(e) => guardarCampo(p.id, { gestionTexto: e.target.value })}
                    className={`border rounded px-2 py-1 w-64 min-h-[44px] ${
                      bloqueada ? "bg-gray-100" : ""
                    }`}
                    placeholder="Escribe la gestión…"
                  />
                </td>

                <td>
                  <button
                    onClick={() => eliminarPoliza(p.id)}
                    disabled={bloqueada}
                    className={`font-bold px-2 ${
                      bloqueada ? "text-gray-400 cursor-not-allowed" : "text-red-600"
                    }`}
                    title={bloqueada ? "Bloqueada: primero desbloquea" : "Eliminar"}
                  >
                    X
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}