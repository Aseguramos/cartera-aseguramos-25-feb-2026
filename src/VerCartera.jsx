import React, { useEffect, useState, Fragment } from "react";
import { db } from "./firebase";
import { getApp } from "firebase/app";
import {
  onSnapshot,
  collection,
  getDocs,
  doc,
  updateDoc,
  deleteDoc,
  writeBatch,
} from "firebase/firestore";

import * as XLSX from "xlsx";
import { saveAs } from "file-saver";
import SubirCartera from "./SubirCartera";

// ===== SEMAFORO POR FECHA (fecha_emision = vencimiento recibo) =====
const MS_DIA = 24 * 60 * 60 * 1000;

const aseguradorasFijas = [
  "Allianz",
  "Sura",
  "Estado",
  "Previsora",
  "Mundial",
  "Solidaria",
  "Axa",
  "Mafre",
  "Sbs",
  "Hdi",
];

const VerCartera = () => {

  console.log("🔥 PROJECT:", getApp().options.projectId);
  // --- UI / estado general ---
  const [data, setData] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState("todos");
  const [filterAseguradora, setFilterAseguradora] = useState("todas");
  const [alerta, setAlerta] = useState({ tipo: "", mensaje: "" });

  // --- Gestión inline por fila ---
  const [openRowId, setOpenRowId] = useState(null);
  const [selectedDocId, setSelectedDocId] = useState(null);
  const [gestionText, setGestionText] = useState("");
  const [rowRecaudada, setRowRecaudada] = useState("");

  const [pendienteSync, setPendienteSync] = useState(false);
  const [colaSync, setColaSync] = useState([]);
  const [online, setOnline] = useState(navigator.onLine);

  // --- Contadores ---
  const [totalCartera, setTotalCartera] = useState(0);
  const [vigentes, setVigentes] = useState(0);
  const [proximas, setProximas] = useState(0);
  const [vencidas, setVencidas] = useState(0);
  const [anuladas, setAnuladas] = useState(0);
  const [gestionSi, setGestionSi] = useState(0);
  const [gestionTexto, setGestionTexto] = useState(0);
  const [filtroGestion, setFiltroGestion] = useState("todos");

  // --- Negativos ---
  const [negativos, setNegativos] = useState(0);
  const [negativosTotal, setNegativosTotal] = useState(0);

  // --- Estado de borrado masivo ---
  const [borrando, setBorrando] = useState(false);

  useEffect(() => {
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);

    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);

    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  useEffect(() => {
    setFiltroGestion("todos");
  }, [filterStatus, filterAseguradora]);

  // ================== HELPERS ==================
  const norm = (v) => String(v || "").toLowerCase().trim();

  const calcularDiasDesdeEmision = (fechaEmision) => {
    if (!fechaEmision) return null;

    // IMPORTANTE: no usar new Date(string) a ciegas con formatos ambiguos
    let fecha = null;

    // ISO (2026-02-24)
    if (typeof fechaEmision === "string" && /^\d{4}-\d{2}-\d{2}$/.test(fechaEmision.trim())) {
      const [y, m, d] = fechaEmision.trim().split("-").map(Number);
      fecha = new Date(y, m - 1, d);
    }
    // Colombia (24/02/2026) o 24-02-2026
    else if (typeof fechaEmision === "string" && /^\d{1,2}[\/-]\d{1,2}[\/-]\d{4}$/.test(fechaEmision.trim())) {
      const [dd, mm, yyyy] = fechaEmision.trim().split(/[\/-]/).map(Number);
      fecha = new Date(yyyy, mm - 1, dd);
    }
    // Date
    else if (fechaEmision instanceof Date) {
      fecha = new Date(fechaEmision.getFullYear(), fechaEmision.getMonth(), fechaEmision.getDate());
    }

    if (!fecha || isNaN(fecha.getTime())) return null;

    const hoy = new Date();
    const hoy0 = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
    const fecha0 = new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate());

    return Math.ceil((fecha0.getTime() - hoy0.getTime()) / MS_DIA);
  };

  // ✅ ANULADA incluye si/sí/pendiente/confirmada
  const esAnulada = (row) => {
    const a = norm(row?.anulada);
    return a === "sí" || a === "si" || a === "pendiente" || a === "confirmada";
  };

  // --- MONTO (lee de 'valor' y, si no, de 'pendiente') ---
  const getMontoRaw = (row) => {
    const keys = ["valor", "Valor", "pendiente", "Pendiente", "PENDIENTE"];
    for (const k of keys) {
      if (row && Object.prototype.hasOwnProperty.call(row, k)) return row[k];
    }
    return row?.valor ?? row?.pendiente ?? "";
  };

  // Parser robusto
  const parseMoney = (v) => {
    let s = String(v ?? "").trim();
    if (!s) return 0;

    s = s.replace(/[\u2010-\u2015\u2212]/g, "-").replace(/\u00A0/g, "");
    const parenNeg = /^\(.*\)$/.test(s);
    s = s.replace(/[^\d.,-]/g, "");

    if (s.includes(".") && s.includes(",")) {
      s = s.replace(/\./g, "").replace(/,/g, ".");
    } else {
      if (s.includes(",") && !s.includes(".")) {
        const last = s.lastIndexOf(",");
        s = s.slice(0, last).replace(/,/g, "") + "." + s.slice(last + 1);
      } else if (s.includes(".")) {
        const last = s.lastIndexOf(".");
        s = s.slice(0, last).replace(/\./g, "") + "." + s.slice(last + 1);
      }
    }

    const hadMinus = /-/.test(s);
    s = s.replace(/-/g, "");
    let num = parseFloat(s);
    if (isNaN(num)) num = 0;

    if (hadMinus || parenNeg) num = -Math.abs(num);
    return num;
  };

  const getMontoNumber = (row) => parseMoney(getMontoRaw(row));
  const esNegativo = (row) => getMontoNumber(row) < 0;

  const getRowColor = (row) => {
    const g = norm(row.gestion);
    const f = row.fecha_emision;

    // anulada o gestionada = gris
    if (!f || g === "si" || g === "sí" || esAnulada(row)) return "#e5e7eb";

    const dias = calcularDiasDesdeEmision(f);
    if (dias === null) return "#e5e7eb";

    // recaudada = azul
    const r = norm(row.recaudada);
    if (r === "si" || r === "sí") return "#bfdbfe";

    // negativo = morado
    if (esNegativo(row)) return "#f5d0fe";

    if (dias <= 0) return "#fecaca";
    if (dias <= 5) return "#fef08a";
    return "#bbf7d0";
  };

  // Categorizadores
  const esVigente = (row) => {
    const g = norm(row.gestion);
    const f = row.fecha_emision;
    if (!f || g === "sí" || g === "si" || esAnulada(row)) return false;
    const d = calcularDiasDesdeEmision(f);
    return d > 5;
  };

  const esProximo = (row) => {
    const g = norm(row.gestion);
    const f = row.fecha_emision;
    if (!f || g === "sí" || g === "si" || esAnulada(row)) return false;
    const d = calcularDiasDesdeEmision(f);
    return d >= 0 && d <= 5;
  };

  const esVencida = (row) => {
    const g = norm(row.gestion);
    const f = row.fecha_emision;
    if (!f || g === "sí" || g === "si" || esAnulada(row)) return false;
    const d = calcularDiasDesdeEmision(f);
    return d < 0;
  };

  const esGestionSi = (row) => {
    const g = norm(row.gestion);
    return g === "sí" || g === "si";
  };

  const esGestionTexto = (row) => {
    const g = norm(row.gestion);
    return g !== "" && g !== "si" && g !== "sí";
  };

  // ================== DATOS ==================
  const cargarDatos = async () => {
    try {
      const snap = await getDocs(collection(db, "cartera"));
      const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setData(docs);
    } catch (e) {
      console.error("Error cargando datos:", e);
    }
  };

  useEffect(() => {
  const ref = collection(db, "cartera");

  const unsubscribe = onSnapshot(
    ref,
    (snap) => {
      console.log("📦 Docs encontrados:", snap.size);
      const documentos = snap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      }));
      setData(documentos);
    },
    (error) => {
      console.error("❌ Error onSnapshot cartera:", error);
    }
  );

  return () => unsubscribe();
}, []);

  // ================== CONTADORES ==================
  useEffect(() => {
    const dataFiltrada =
      filterAseguradora === "todas"
        ? data
        : data.filter((row) => norm(row.aseguradora) === norm(filterAseguradora));

    setTotalCartera(dataFiltrada.length);
    setVigentes(dataFiltrada.filter(esVigente).length);
    setProximas(dataFiltrada.filter(esProximo).length);
    setVencidas(dataFiltrada.filter(esVencida).length);
    setAnuladas(dataFiltrada.filter(esAnulada).length);
    setGestionSi(dataFiltrada.filter(esGestionSi).length);
    setGestionTexto(dataFiltrada.filter(esGestionTexto).length);

    const negRows = dataFiltrada.filter(esNegativo);
    setNegativos(negRows.length);
    setNegativosTotal(negRows.reduce((acc, r) => acc + getMontoNumber(r), 0));
  }, [data, filterAseguradora]);

  // ================== EXPORTAR ==================
  const exportarExcel = () => {
    const wb = XLSX.utils.book_new();
    const wsData = data.map((row) => ({
      Aseguradora: row.aseguradora,
      Nombre: row.nombre,
      Asesor: row.asesor,
      Placa: row.placa,
      Ramo: row.ramo,
      Poliza: row.poliza,
      "Fecha Emision": row.fecha_emision,
      "Fecha Vencimiento": row.fecha_vencimiento,
      Valor: row.valor,
      Recaudada: row.recaudada,
      Observacion: row.observacion,
      Gestion: row.gestion,
      Anulada: row.anulada,
    }));
    const ws = XLSX.utils.json_to_sheet(wsData);
    XLSX.utils.book_append_sheet(wb, ws, "Cartera");
    const excelBuffer = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    const blob = new Blob([excelBuffer], { type: "application/octet-stream" });
    saveAs(blob, "cartera_exportada.xlsx");
  };

  // ================== WHATSAPP ==================
  const enviarAlertaWhatsapp = async () => {
    const numeroDestino = "whatsapp:+573242139020";
    const proximasVencidas = data.filter((row) => {
      const dias = calcularDiasDesdeEmision(row["fecha_emision"]);
      return dias >= 25 && dias <= 30;
    });
    if (!proximasVencidas.length) return window.alert("No hay pólizas próximas a vencer.");

    const mensaje = proximasVencidas
      .map((p) => `• Póliza: ${p.poliza}, Emisión: ${p.fecha_emision}`)
      .join("\n");

    const cuerpo = `⚠️ *ALERTA DE CARTERA PRÓXIMA A VENCER* ⚠️\n\n${mensaje}`;

    try {
      const r = await fetch("http://localhost:3000/send-alert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: numeroDestino, message: cuerpo }),
      });
      if (!r.ok) return window.alert("Error: " + (await r.text()));
      window.alert("¡Alerta enviada exitosamente!");
    } catch (e) {
      window.alert("Error de red: " + e.message);
    }
  };

  // ================== BORRADOS POR CONTADOR ==================
  const borrarPorFiltro = async (nombreGrupo, predicado) => {
    const ok1 = window.confirm(
      `⚠️ Vas a BORRAR definitivamente las pólizas del grupo "${nombreGrupo}". ¿Continuar?`
    );
    if (!ok1) return;

    const ok2 = (window.prompt(`Escribe BORRAR para confirmar el borrado de "${nombreGrupo}".`) || "")
      .toUpperCase();
    if (ok2 !== "BORRAR") return;

    try {
      setBorrando(true);
      const snap = await getDocs(collection(db, "cartera"));
      const objetivos = snap.docs.filter((d) => predicado({ id: d.id, ...d.data() }));

      if (!objetivos.length) {
        setBorrando(false);
        return window.alert(`No hay documentos en "${nombreGrupo}" para borrar.`);
      }

      let total = 0;
      for (let i = 0; i < objetivos.length; i += 450) {
        const chunk = objetivos.slice(i, i + 450);
        const batch = writeBatch(db);
        chunk.forEach((d) => batch.delete(doc(db, "cartera", d.id)));
        await batch.commit();
        total += chunk.length;
        await new Promise((r) => setTimeout(r, 25));
      }

      await cargarDatos();
      setAlerta({ tipo: "ok", mensaje: `Borradas ${total} pólizas del grupo "${nombreGrupo}".` });
      setTimeout(() => setAlerta({ tipo: "", mensaje: "" }), 3000);
    } catch (e) {
      console.error(e);
      setAlerta({ tipo: "error", mensaje: `No se pudo borrar "${nombreGrupo}".` });
      setTimeout(() => setAlerta({ tipo: "", mensaje: "" }), 3500);
    } finally {
      setBorrando(false);
    }
  };

  // ✅ confirmar anulación = borrar definitivo
  const confirmarEliminacion = async (id) => {
    if (!window.confirm("¿Deseas eliminar esta póliza anulada permanentemente?")) return;
    await deleteDoc(doc(db, "cartera", id));
    window.alert("Póliza eliminada definitivamente.");
  };

  const formatCOP = (n) =>
    new Intl.NumberFormat("es-CO", {
      style: "currency",
      currency: "COP",
      maximumFractionDigits: 0,
    }).format(n || 0);

  // ================== FILTRADO RENDER ==================
  const dataRender = data.filter((row) => {
    const term = norm(searchTerm);
    const cumpleAseguradora =
      filterAseguradora === "todas" || norm(row.aseguradora) === norm(filterAseguradora);
    if (!cumpleAseguradora) return false;

    const coincideBusqueda =
      term === "" ||
      norm(row.nombre).includes(term) ||
      norm(row.cliente).includes(term) ||
      norm(row.producto).includes(term) ||
      norm(row.poliza).includes(term) ||
      norm(row.documento).includes(term) ||
      norm(row.placa).includes(term);

    if (!coincideBusqueda) return false;

    const dias = calcularDiasDesdeEmision(row.fecha_emision);
    const gestion = norm(row.gestion);

    if (filtroGestion === "si" && gestion !== "sí" && gestion !== "si") return false;
    if (filtroGestion === "texto" && (gestion === "" || gestion === "si" || gestion === "sí")) return false;

    if (filterStatus === "vigente") return dias > 6 && !esAnulada(row);
    if (filterStatus === "proximo") return dias >= 1 && dias <= 5 && !esAnulada(row);
    if (filterStatus === "vencido") return dias < 0 && gestion !== "si" && gestion !== "sí" && !esAnulada(row);
    if (filterStatus === "anulada") return esAnulada(row);
    if (filterStatus === "negativos") return esNegativo(row);

    return true;
  });

  // ================== RENDER ==================
  return (
    <div className="w-full">
      {pendienteSync && (
        <div
          style={{
            background: "#facc15",
            padding: "8px",
            textAlign: "center",
            fontWeight: "bold",
          }}
        >
          🔄 Hay gestiones pendientes por sincronizar
        </div>
      )}

      {/* ====== BANNER FIJO ARRIBA ====== */}
      <div className="sticky top-0 z-50 bg-white shadow-sm">
        <div className="w-full bg-gradient-to-r from-blue-50 via-white to-blue-50 py-4">
          <div className="max-w-5xl mx-auto flex justify-center items-center px-2">
            <img src="/logos/reporama.png" alt="Reporama" className="w-full max-w-4xl object-contain" />
          </div>
        </div>
      </div>

      {/* ====== CONTENIDO ====== */}
      <div className="max-w-[1500px] mx-auto px-2 pb-3">
        {/* Subir cartera */}
        <SubirCartera recargar={cargarDatos} />

        {alerta.mensaje && (
          <div
            className={`p-4 mb-6 rounded text-white text-center ${
              alerta.tipo === "error" ? "bg-red-500" : "bg-blue-500"
            }`}
          >
            {alerta.mensaje}
          </div>
        )}

        {/* Resumen */}
        <div className="bg-indigo-200 text-indigo-800 min-w-[160px] px-6 py-2 rounded-lg shadow text-center flex justify-center items-center gap-2 mb-3">
          📊 <span className="font-bold">Total Cartera:</span> {totalCartera}
        </div>

        <div className="flex justify-center items-center gap-3 mb-4 flex-nowrap overflow-x-auto">
          <div className="bg-green-200 text-green-800 px-6 py-2 rounded-lg shadow text-center w-56 flex justify-center items-center gap-2">
            ✅ <span className="font-bold">Vigentes:</span> {vigentes}
          </div>
          <div className="bg-yellow-200 text-yellow-800 px-6 py-2 rounded-lg shadow text-center w-56 flex justify-center items-center gap-2">
            ⏳ <span className="font-bold">Próximos:</span> {proximas}
          </div>
          <div className="bg-red-200 text-red-800 px-6 py-2 rounded-lg shadow text-center w-56 flex justify-center items-center gap-2">
            ⛔ <span className="font-bold">Vencidas:</span> {vencidas}
          </div>
          <div className="bg-gray-300 text-gray-800 px-6 py-2 rounded-lg shadow text-center w-56 flex justify-center items-center gap-2">
            ❌ <span className="font-bold">Anuladas:</span> {anuladas}
          </div>

          <div className="bg-yellow-200 p-2 rounded shadow">
            <div className="text-yellow-800 font-bold text-xl">{gestionSi}</div>
            <div className="text-gray-700">Gestión = "sí"</div>
          </div>

          <div className="bg-blue-100 p-2 rounded shadow">
            <div className="text-blue-800 font-bold text-xl">{gestionTexto}</div>
            <div className="text-gray-700">Gestión con texto</div>
          </div>

          <div className="bg-purple-200 text-rose-800 px-6 py-2 rounded-lg shadow text-center w-64 flex flex-col items-center gap-1">
            <div className="flex items-center gap-2">
              ➖ <span className="font-bold">Negativos:</span> {negativos}
            </div>
            <div className="text-sm">
              Total: <span className="font-semibold">{formatCOP(negativosTotal)}</span>
            </div>
          </div>
        </div>

        {/* ✅✅✅ AQUÍ ESTÁN TUS BOTONES DE BORRADO (los que se te perdieron) ✅✅✅ */}
        <div className="flex gap-2 flex-wrap justify-center mb-8">
          <button
            disabled={borrando}
            onClick={() => borrarPorFiltro("Vigentes", esVigente)}
            className={`px-3 py-2 rounded ${borrando ? "opacity-60" : ""} bg-green-700 text-white hover:bg-green-800`}
          >
            {borrando ? "Borrando..." : "Borrar Vigentes"}
          </button>

          <button
            disabled={borrando}
            onClick={() => borrarPorFiltro("Próximos", esProximo)}
            className={`px-3 py-2 rounded ${borrando ? "opacity-60" : ""} bg-yellow-600 text-white hover:bg-yellow-700`}
          >
            {borrando ? "Borrando..." : "Borrar Próximos"}
          </button>

          <button
            disabled={borrando}
            onClick={() => borrarPorFiltro("Vencidas", esVencida)}
            className={`px-3 py-2 rounded ${borrando ? "opacity-60" : ""} bg-red-700 text-white hover:bg-red-800`}
          >
            {borrando ? "Borrando..." : "Borrar Vencidas"}
          </button>

          <button
            disabled={borrando}
            onClick={() => borrarPorFiltro("Anuladas", esAnulada)}
            className={`px-3 py-2 rounded ${borrando ? "opacity-60" : ""} bg-gray-700 text-white hover:bg-gray-800`}
          >
            {borrando ? "Borrando..." : "Borrar Anuladas"}
          </button>

          <button
            disabled={borrando}
            onClick={() => borrarPorFiltro('Gestión = "sí"', esGestionSi)}
            className={`px-3 py-2 rounded ${borrando ? "opacity-60" : ""} bg-amber-700 text-white hover:bg-amber-800`}
          >
            {borrando ? "Borrando..." : 'Borrar Gestión = "sí"'}
          </button>

          <button
            disabled={borrando}
            onClick={() => borrarPorFiltro("Gestión con texto", esGestionTexto)}
            className={`px-3 py-2 rounded ${borrando ? "opacity-60" : ""} bg-blue-700 text-white hover:bg-blue-800`}
          >
            {borrando ? "Borrando..." : "Borrar Gestión (texto)"}
          </button>

          <button
            disabled={borrando}
            onClick={() =>
              borrarPorFiltro(
                `Negativos (valor/pendiente < 0${filterAseguradora !== "todas" ? `, ${filterAseguradora}` : ""})`,
                (row) =>
                  esNegativo(row) &&
                  (filterAseguradora === "todas" || norm(row.aseguradora) === norm(filterAseguradora))
              )
            }
            className={`px-3 py-2 rounded ${borrando ? "opacity-60" : ""} bg-rose-700 text-white hover:bg-rose-800`}
          >
            {borrando ? "Borrando..." : "Borrar Negativos (filtro actual)"}
          </button>
        </div>

        {/* WhatsApp */}
        <div className="flex justify-center mb-6">
          <button
            className="bg-green-600 hover:bg-green-700 text-white py-2 px-6 rounded-lg shadow-lg"
            onClick={enviarAlertaWhatsapp}
          >
            Enviar Alerta a WhatsApp
          </button>
        </div>
      </div>

      {/* ====== FILTROS STICKY ====== */}
      <div className="sticky top-[110px] z-40 bg-white border-t shadow-sm">
        <div className="max-w-[1500px] mx-auto px-2 py-2">
          <div className="flex justify-center mb-4 gap-4 flex-wrap">
            <select
              className="border p-3 rounded-md shadow-md"
              value={filterAseguradora}
              onChange={(e) => setFilterAseguradora(e.target.value)}
            >
              <option value="todas">Todas las Aseguradoras</option>
              {aseguradorasFijas.map((aseg, idx) => (
                <option key={idx} value={aseg}>
                  {aseg}
                </option>
              ))}
            </select>

            <input
              type="text"
              placeholder="Buscar por nombre, póliza o placa..."
              className="border p-3 rounded-md shadow-md w-96"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />

            <button
              className={`${filterStatus === "todos" ? "bg-blue-600" : "bg-blue-500"} text-white py-2 px-4 rounded shadow`}
              onClick={() => setFilterStatus("todos")}
            >
              Todos
            </button>

            <button
              className="bg-green-500 hover:bg-green-600 text-white py-2 px-4 rounded shadow"
              onClick={() => setFilterStatus("vigente")}
            >
              Vigentes
            </button>

            <button
              className="bg-yellow-400 hover:bg-yellow-500 text-black py-2 px-4 rounded shadow"
              onClick={() => setFilterStatus("proximo")}
            >
              Próximos
            </button>

            <button
              className="bg-red-500 hover:bg-red-600 text-white py-2 px-4 rounded shadow"
              onClick={() => setFilterStatus("vencido")}
            >
              Vencidos
            </button>

            <button
              className={`${filterStatus === "negativos" ? "bg-purple-600 text-white" : "bg-rose-200 text-black"} hover:bg-purple-500 py-2 px-4 rounded shadow`}
              onClick={() => setFilterStatus("negativos")}
            >
              Negativos
            </button>

            <button
              className={`${filtroGestion === "si" ? "bg-yellow-500 text-white" : "bg-yellow-200 text-black"} hover:bg-yellow-400 py-2 px-4 rounded shadow`}
              onClick={() => setFiltroGestion(filtroGestion === "si" ? "todos" : "si")}
            >
              Gestión = "sí"
            </button>

            <button
              className={`${filtroGestion === "texto" ? "bg-blue-500 text-white" : "bg-blue-100 text-black"} hover:bg-blue-400 py-2 px-4 rounded shadow`}
              onClick={() => setFiltroGestion(filtroGestion === "texto" ? "todos" : "texto")}
            >
              Gestión con texto
            </button>

            <button
              className="bg-gray-500 hover:bg-gray-600 text-white py-2 px-4 rounded shadow"
              onClick={() => setFilterStatus("anulada")}
            >
              Anuladas
            </button>

            <button
              className="bg-purple-500 hover:bg-purple-600 text-white py-2 px-4 rounded shadow"
              onClick={exportarExcel}
            >
              Exportar a Excel
            </button>
          </div>
        </div>
      </div>

      {/* ====== TABLA ====== */}
      <div className="max-w-[1500px] mx-auto px-2">
        <div className="max-h-[calc(100vh-260px)] overflow-auto border rounded-lg shadow-lg">
          <table className="w-full border-collapse rounded-lg text-base shadow-lg">
            <thead className="bg-gray-300 sticky top-0 z-30">
              <tr>
                <th className="px-2 py-2 border text-center bg-gray-300">Aseguradora</th>
                <th className="px-2 py-2 border text-center bg-gray-300">Nombre</th>
                <th className="px-2 py-2 border text-center bg-gray-300">Documento</th>
                <th className="px-2 py-2 border text-center bg-gray-300">Asesor</th>
                <th className="px-2 py-2 border text-center bg-gray-300">Placa</th>
                <th className="px-2 py-2 border text-center bg-gray-300">Ramo</th>
                <th className="px-2 py-2 border text-center bg-gray-300">Póliza</th>
                <th className="px-2 py-2 border text-center bg-gray-300">Valor</th>
                <th className="px-2 py-2 border text-center bg-gray-300">Fecha Emisión</th>
                <th className="px-2 py-2 border text-center bg-gray-300">Fecha Vencimiento</th>
                <th className="px-2 py-2 border text-center bg-gray-300">Recaudada</th>
                <th className="px-2 py-2 border text-center bg-gray-300">Acciones</th>
                <th className="px-2 py-2 border text-center bg-gray-300">Gestión</th>
              </tr>
            </thead>

            <tbody>
              {dataRender.map((row) => (
                <Fragment key={row.id}>
                  <tr style={{ backgroundColor: getRowColor(row) }}>
                    <td className="px-2 py-2 border text-center">{row.aseguradora}</td>
                    <td className="px-2 py-2 border text-center">{row.nombre}</td>
                    <td className="px-2 py-2 border text-center">{row.documento}</td>
                    <td className="px-2 py-2 border text-center">{row.asesor}</td>
                    <td className="px-2 py-2 border text-center">{row.placa}</td>
                    <td className="px-2 py-2 border text-center">{row.ramo}</td>
                    <td className="px-2 py-2 border text-center">{row.poliza}</td>
                    <td className="px-2 py-2 border text-center">{formatCOP(parseMoney(row.valor))}</td>
                    <td className="px-2 py-1 border text-center">{row.fecha_emision}</td>
                    <td className="px-2 py-1 border text-center">{row.fecha_vencimiento}</td>
                    <td className="px-2 py-1 border text-center">{row.recaudada}</td>

                    <td className="px-2 py-1 border text-center">
                      <div className="flex gap-2 justify-center flex-wrap">
                        {esAnulada(row) && (
                          <button
                            onClick={() => confirmarEliminacion(row.id)}
                            className="bg-red-600 hover:bg-red-700 text-white px-2 py-1 rounded"
                          >
                            Confirmar Anulación
                          </button>
                        )}

                        <button
                          onClick={() => {
                            const next = openRowId === row.id ? null : row.id;
                            setOpenRowId(next);
                            setSelectedDocId(row.id);
                            setRowRecaudada(row.recaudada || "");
                            setGestionText(row.gestion || "");
                          }}
                          className="bg-blue-500 hover:bg-blue-700 text-white px-3 py-1 rounded"
                        >
                          {openRowId === row.id ? "Cerrar" : "Gestionar"}
                        </button>
                      </div>
                    </td>

                    <td className="px-2 py-1 border text-center">
                      {row.gestion || <span className="text-gray-400">Sin gestión</span>}
                    </td>
                  </tr>

                  {openRowId === row.id && (
                    <tr className="bg-gray-50">
                      <td colSpan={13} className="px-4 py-4 border">
                        <div className="flex flex-col gap-3">
                          <div className="text-sm text-gray-700">
                            Gestionando póliza <span className="font-semibold">{row.poliza}</span> · {row.aseguradora}
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <div>
                              <label className="block text-xs text-gray-600 mb-2">Recaudada</label>
                              <select
                                className="w-full border p-2 rounded"
                                value={rowRecaudada}
                                onChange={(e) => setRowRecaudada(e.target.value)}
                              >
                                <option value="">Selecciona...</option>
                                <option value="Sí">Sí</option>
                              </select>
                            </div>

                            <div className="md:col-span-2">
                              <label className="block text-xs text-gray-600 mb-2">Gestión / Nota</label>
                              <textarea
                                className="w-full border p-2 rounded min-h-[90px]"
                                rows="4"
                                placeholder="Escribe tu gestión aquí..."
                                value={gestionText}
                                onChange={(e) => setGestionText(e.target.value)}
                              />
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <button
                              className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700"
                              onClick={async () => {
                                if (!selectedDocId) return window.alert("No se encontró el ID del documento.");

                                try {
                                  const valorGestion =
                                    norm(rowRecaudada) === "sí" || norm(rowRecaudada) === "si" ? "si" : gestionText;

                                  const datosUpdate = {
                                    recaudada: rowRecaudada,
                                    gestion: valorGestion,
                                  };

                                  if (!online) {
                                    setColaSync((prev) => [...prev, { id: selectedDocId, datos: datosUpdate }]);
                                    setPendienteSync(true);
                                    setOpenRowId(null);

                                    setAlerta({ tipo: "ok", mensaje: "Gestión guardada (pendiente de sincronizar)" });
                                    setTimeout(() => setAlerta({ tipo: "", mensaje: "" }), 2500);
                                  } else {
                                    await updateDoc(doc(db, "cartera", selectedDocId), datosUpdate);
                                    setOpenRowId(null);

                                    setAlerta({ tipo: "ok", mensaje: "Gestión guardada correctamente" });
                                    setTimeout(() => setAlerta({ tipo: "", mensaje: "" }), 2500);
                                  }
                                } catch (e) {
                                  console.error("Error al guardar gestión:", e);
                                  setAlerta({ tipo: "error", mensaje: "Hubo un error al guardar la gestión." });
                                  setTimeout(() => setAlerta({ tipo: "", mensaje: "" }), 3000);
                                }
                              }}
                            >
                              Guardar Gestión
                            </button>

                            <button
                              className="bg-white border px-2 py-1 rounded hover:bg-gray-100"
                              onClick={() => setOpenRowId(null)}
                            >
                              Cancelar
                            </button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default VerCartera;