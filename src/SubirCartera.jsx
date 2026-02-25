import React, { useState } from "react";
import * as XLSX from "xlsx";
import { db } from "./firebase";
import { collection, getDocs, addDoc, updateDoc, doc } from "firebase/firestore";

const SubirCartera = ({ recargar }) => {
  const [cargandoExcel, setCargandoExcel] = useState(false);
  const [msgExcel, setMsgExcel] = useState("");

  // ================= NORMALIZACIÓN =================
  const normalizar = (valor) =>
    (valor || "")
      .toString()
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, "")
      .replace(/[^a-z0-9]/g, "");

  // ================= FECHAS =================
  // Normaliza TODO a "YYYY-MM-DD"
  const formatFecha = (fecha) => {
    if (fecha == null || fecha === "") return "";

    // Firestore Timestamp
    if (typeof fecha === "object" && typeof fecha.toDate === "function") {
      const d = fecha.toDate();
      if (isNaN(d.getTime())) return "";
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const dd = String(d.getDate()).padStart(2, "0");
      return `${y}-${m}-${dd}`;
    }

    // Date
    if (fecha instanceof Date) {
      if (isNaN(fecha.getTime())) return "";
      const y = fecha.getFullYear();
      const m = String(fecha.getMonth() + 1).padStart(2, "0");
      const d = String(fecha.getDate()).padStart(2, "0");
      return `${y}-${m}-${d}`;
    }

    // Excel serial
    if (typeof fecha === "number" && isFinite(fecha)) {
      const parsed = XLSX.SSF?.parse_date_code?.(fecha);
      if (parsed && parsed.y && parsed.m && parsed.d) {
        const y = String(parsed.y);
        const m = String(parsed.m).padStart(2, "0");
        const d = String(parsed.d).padStart(2, "0");
        return `${y}-${m}-${d}`;
      }
      const MS_DIA = 24 * 60 * 60 * 1000;
      const excelEpoch = new Date(1899, 11, 30);
      const dt = new Date(excelEpoch.getTime() + Math.round(fecha) * MS_DIA);
      if (isNaN(dt.getTime())) return "";
      const y = dt.getFullYear();
      const m = String(dt.getMonth() + 1).padStart(2, "0");
      const d = String(dt.getDate()).padStart(2, "0");
      return `${y}-${m}-${d}`;
    }

    // String
    if (typeof fecha === "string") {
      let s = fecha.trim();
      if (!s) return "";

      s = s.split("T")[0];
      s = s.split(" ")[0];

      // yyyy-mm-dd
      if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(s)) {
        const [y, m, d] = s.split("-").map((x) => x.trim());
        return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      }

      // dd/mm/yyyy o dd-mm-yyyy
      if (/^\d{1,2}[\/-]\d{1,2}[\/-]\d{4}$/.test(s)) {
        const [dd, mm, yyyy] = s.split(/[\/-]/).map((x) => x.trim());
        return `${yyyy}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
      }

      // dd/mm/yy
      if (/^\d{1,2}[\/-]\d{1,2}[\/-]\d{2}$/.test(s)) {
        const [dd, mm, yy] = s.split(/[\/-]/).map((x) => x.trim());
        const n = Number(yy);
        const yyyy = n <= 69 ? `20${String(n).padStart(2, "0")}` : `19${String(n).padStart(2, "0")}`;
        return `${yyyy}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
      }

      return "";
    }

    return "";
  };

  // ================= HEADERS FLEXIBLES =================
  const getByHeaderLike = (item, posibles) => {
    const keys = Object.keys(item || {});
    const mapa = {};
    for (const k of keys) mapa[normalizar(k)] = k;

    for (const p of posibles) {
      const nk = normalizar(p);
      if (mapa[nk] && item[mapa[nk]] != null) return item[mapa[nk]];
    }
    return "";
  };

  const getPolizaExcel = (item) =>
    getByHeaderLike(item, [
      "Poliza",
      "Póliza",
      "No. Poliza",
      "No. Póliza",
      "No Poliza",
      "No Póliza",
      "Numero Poliza",
      "Número Póliza",
      "Poliza No",
      "Póliza No",
      "Recibo",
      "No. Recibo",
    ]);

  const getFechaEmisionExcel = (item) =>
    getByHeaderLike(item, [
      "Fecha de emisión",
      "Fecha de emision",
      "Fecha emisión",
      "Fecha emision",
      "Emisión",
      "Emision",
      "Fecha de expedición",
      "Fecha de expedicion",
      "Fecha expedición",
      "Fecha expedicion",
    ]);

  const getFechaVencExcel = (item) =>
    getByHeaderLike(item, [
      "Fecha de vencimiento",
      "Fecha vencimiento",
      "Vencimiento",
      "Vence",
      "Vigencia hasta",
      "Fin vigencia",
    ]);

  // ✅ LLAVE REAL: póliza + fecha_emisión (SIN fallback)
  const buildClaveBase = (poliza, fechaEmision) => {
    const p = normalizar(poliza);
    const f = formatFecha(fechaEmision);
    if (!p || !f) return "";
    return `${p}_${f}`;
  };

  // congeladas no se tocan
  const esCongelada = (anulada) => {
    const v = (anulada ?? "").toString().trim().toLowerCase();
    return v === "pendiente" || v === "confirmada";
  };

  // para auditoría total anuladas (incluye si/sí/pendiente/confirmada)
  const esAnuladaCualquierEstado = (anulada) => {
    const v = (anulada ?? "").toString().trim().toLowerCase();
    return v === "si" || v === "sí" || v === "pendiente" || v === "confirmada";
  };

  const handleFileUpload = async (event) => {
    const input = event.target;
    const file = input.files?.[0];
    if (!file) return;

    setCargandoExcel(true);
    setMsgExcel("📥 Cargando y procesando Excel...");

    try {
      const reader = new FileReader();

      reader.onload = async (e) => {
        try {
          const bytes = new Uint8Array(e.target.result);
          const workbook = XLSX.read(bytes, { type: "array", cellDates: true });
          const sheetName = workbook.SheetNames[0];
          const sheet = workbook.Sheets[sheetName];
          const dataExcel = XLSX.utils.sheet_to_json(sheet, { defval: "" });

          const carteraCollection = collection(db, "cartera");
          const snap = await getDocs(carteraCollection);

          // ================= AUDITORÍA INICIAL (antes del cargue) =================
          const totalAntes = snap.size;
          const anuladasAntes = snap.docs.filter((d) => esAnuladaCualquierEstado(d.data()?.anulada)).length;

          // =========================================================
          // ✅ PRIMER CARGUE: SUBE TODO (sin comparar)
          // =========================================================
          if (snap.empty) {
            setMsgExcel("📦 Primer cargue: subiendo TODO (sin comparar)");

            let subidas = 0;
            let sinPoliza = 0;
            let sinFechaEmision = 0;

            for (let i = 0; i < dataExcel.length; i++) {
              const item = dataExcel[i];

              const pol = getPolizaExcel(item);
              if (!String(pol ?? "").trim()) {
                sinPoliza++;
                continue;
              }

              const feRaw = getFechaEmisionExcel(item);
              const fvRaw = getFechaVencExcel(item);

              const feNorm = formatFecha(feRaw);
              const fvNorm = formatFecha(fvRaw);

              if (!feNorm) sinFechaEmision++;

              const clave_base = buildClaveBase(pol, feRaw) || `${normalizar(pol)}_sinfechaemision`;
              const clave_unica = `${clave_base}__fila_${i + 1}`;

              const nuevaData = {
                aseguradora: getByHeaderLike(item, ["Aseguradora", "Compania", "Compañia"]) || "",
                nombre: getByHeaderLike(item, ["Nombre", "Asegurado", "Tomador"]) || "",
                asesor: getByHeaderLike(item, ["Asesor"]) || "",
                placa: getByHeaderLike(item, ["Placa"]) || "",
                ramo: getByHeaderLike(item, ["Ramo"]) || "",
                poliza: pol || "",
                fecha_emision: feNorm || "",
                fecha_vencimiento: fvNorm || "",
                valor: getByHeaderLike(item, ["Valor", "Prima", "Total"]) || "",
                pendiente: getByHeaderLike(item, ["Pendiente"]) || "",
                recaudada: getByHeaderLike(item, ["Recaudada"]) || "",
                observacion: getByHeaderLike(item, ["Observacion", "Observación", "Notas"]) || "",
                vigente: (getByHeaderLike(item, ["Vigente"]) ?? "si").toString().toLowerCase(),
                pago_jl: getByHeaderLike(item, ["Pago JL", "PagoJL"]) || "",
                gestion: "",
                anulada: "no",
                clave_base,
                clave_unica,
              };

              await addDoc(carteraCollection, nuevaData);
              subidas++;
            }

            if (recargar) await recargar();

            setMsgExcel("");
            setCargandoExcel(false);
            input.value = "";

            window.alert(
              `✅ Primer cargue terminado\n\n` +
                `Filas Excel: ${dataExcel.length}\n` +
                `Subidas: ${subidas}\n` +
                `Sin póliza: ${sinPoliza}\n` +
                `Sin fecha_emisión (quedan con fecha_emision vacía): ${sinFechaEmision}\n\n` +
                `👉 Desde el SEGUNDO cargue ya compara por póliza + fecha_emisión`
            );
            return;
          }

          // =========================================================
          // ✅ CARGUE NORMAL: COMPARA POR póliza + fecha_emisión
          // =========================================================
          setMsgExcel("🧠 Comparando por póliza + fecha_emisión...");

          // Set de pólizas existentes (para separar NUEVAS REALES vs NUEVAS POR FECHA)
          const polizasExistentes = new Set();
          snap.forEach((d) => {
            const x = d.data();
            const p = normalizar(x?.poliza);
            if (p) polizasExistentes.add(p);
          });

          // Mapa Firebase por clave_base (1 registro por clave)
          const firebasePorClave = {};
          snap.forEach((d) => {
            const x = d.data();
            const clave = x.clave_base || buildClaveBase(x.poliza, x.fecha_emision);
            if (!clave) return;
            if (!firebasePorClave[clave]) firebasePorClave[clave] = { id: d.id, data: x };
          });

          const clavesExcel = new Set();
          const excelProcesadas = new Set();

          let nuevasReales = 0;
          let nuevasPorFecha = 0;
          let actualizadas = 0;
          let omitidasSinClave = 0;

          for (const item of dataExcel) {
            const pol = getPolizaExcel(item);
            const feRaw = getFechaEmisionExcel(item);
            const fvRaw = getFechaVencExcel(item);

            const clave_base = buildClaveBase(pol, feRaw);
            if (!clave_base) {
              omitidasSinClave++;
              continue;
            }

            // dedupe SOLO si el Excel trae repetida EXACTA la misma llave
            if (excelProcesadas.has(clave_base)) continue;
            excelProcesadas.add(clave_base);

            clavesExcel.add(clave_base);

            const existente = firebasePorClave[clave_base] || null;

            // si existe y está congelada, NO tocar
            if (existente?.id && esCongelada(existente?.data?.anulada)) {
              continue;
            }

            const feNorm = formatFecha(feRaw) || "";
            const fvNorm = formatFecha(fvRaw) || "";

            const nuevaData = {
              aseguradora:
                getByHeaderLike(item, ["Aseguradora", "Compania", "Compañia"]) ||
                existente?.data?.aseguradora ||
                "",
              nombre: getByHeaderLike(item, ["Nombre", "Asegurado", "Tomador"]) || existente?.data?.nombre || "",
              asesor: getByHeaderLike(item, ["Asesor"]) || existente?.data?.asesor || "",
              placa: getByHeaderLike(item, ["Placa"]) || existente?.data?.placa || "",
              ramo: getByHeaderLike(item, ["Ramo"]) || existente?.data?.ramo || "",
              poliza: pol || existente?.data?.poliza || "",
              fecha_emision: feNorm || existente?.data?.fecha_emision || "",
              fecha_vencimiento: fvNorm || existente?.data?.fecha_vencimiento || "",
              valor: getByHeaderLike(item, ["Valor", "Prima", "Total"]) || existente?.data?.valor || "",
              pendiente: getByHeaderLike(item, ["Pendiente"]) || existente?.data?.pendiente || "",
              recaudada: getByHeaderLike(item, ["Recaudada"]) || existente?.data?.recaudada || "",
              observacion:
                getByHeaderLike(item, ["Observacion", "Observación", "Notas"]) ||
                existente?.data?.observacion ||
                "",
              vigente: (getByHeaderLike(item, ["Vigente"]) ?? existente?.data?.vigente ?? "si")
                .toString()
                .toLowerCase(),
              pago_jl: getByHeaderLike(item, ["Pago JL", "PagoJL"]) || existente?.data?.pago_jl || "",

              // conservar gestión
              gestion: existente?.data?.gestion || "",

              // si viene en Excel queda activa
              anulada: "no",

              clave_base,
            };

            if (existente?.id) {
              await updateDoc(doc(db, "cartera", existente.id), nuevaData);
              actualizadas++;
            } else {
              await addDoc(carteraCollection, {
                ...nuevaData,
                clave_unica: `${clave_base}__nuevo_${Date.now()}`,
              });

              const pNorm = normalizar(pol);
              if (pNorm && polizasExistentes.has(pNorm)) {
                nuevasPorFecha++;
              } else {
                nuevasReales++;
                if (pNorm) polizasExistentes.add(pNorm);
              }
            }
          }

          // ✅ Anular pendiente lo que NO vino en Excel
          setMsgExcel("🧹 Pasando a anulada (pendiente) lo que no vino en Excel...");

          let anuladasPendienteEnEsteCargue = 0;
          let faltantesYaCongeladas = 0; // las que NO vienen pero ya estaban pendiente/confirmada

          for (const d of snap.docs) {
            const x = d.data();
            const clave = x.clave_base || buildClaveBase(x.poliza, x.fecha_emision);
            if (!clave) continue;

            // Si no vino en Excel
            if (!clavesExcel.has(clave)) {
              // Si ya estaba congelada, NO tocar, pero sí reportar
              if (esCongelada(x.anulada)) {
                faltantesYaCongeladas++;
                continue;
              }

              const yaEraPendiente = (x.anulada ?? "").toString().trim().toLowerCase() === "pendiente";

              await updateDoc(doc(db, "cartera", d.id), {
                anulada: "pendiente",
                vigente: "no",
                fecha_paso_anulada: new Date().toISOString(),
              });

              if (!yaEraPendiente) anuladasPendienteEnEsteCargue++;
            }
          }

          // ================= AUDITORÍA FINAL (después del cargue) =================
          setMsgExcel("📌 Auditoría final (validando totales en Firestore)...");
          const snapFinal = await getDocs(carteraCollection);
          const totalDespues = snapFinal.size;
          const anuladasDespues = snapFinal.docs.filter((d) => esAnuladaCualquierEstado(d.data()?.anulada)).length;
          const activasDespues = totalDespues - anuladasDespues;

          if (recargar) await recargar();

          setMsgExcel("");
          setCargandoExcel(false);
          input.value = "";

          window.alert(
            `✅ Cargue terminado\n\n` +
              `Actualizadas (misma póliza + misma fecha_emisión): ${actualizadas}\n` +
              `Nuevas REALES (póliza que no existía): ${nuevasReales}\n` +
              `Nuevas por FECHA (misma póliza, fecha_emisión diferente): ${nuevasPorFecha}\n` +
              `Anuladas (pendiente) por no venir en Excel (EN ESTE CARGUE): ${anuladasPendienteEnEsteCargue}\n` +
              `Faltantes que YA estaban congeladas (pendiente/confirmada): ${faltantesYaCongeladas}\n` +
              `Omitidas sin llave (sin fecha_emisión válida): ${omitidasSinClave}\n\n` +
              `📌 AUDITORÍA (Firestore)\n` +
              `Total en sistema: ${totalDespues}\n` +
              `Activas (no anuladas): ${activasDespues}\n` +
              `Anuladas totales (si/pendiente/confirmada): ${anuladasDespues}\n` +
              `Ya estaban anuladas antes del cargue: ${anuladasAntes}`
          );
        } catch (err) {
          console.error(err);
          setMsgExcel("");
          setCargandoExcel(false);
          input.value = "";
          window.alert("❌ Error subiendo Excel. Revisa consola (F12).");
        }
      };

      reader.onerror = () => {
        setMsgExcel("");
        setCargandoExcel(false);
        input.value = "";
        window.alert("❌ No se pudo leer el archivo.");
      };

      reader.readAsArrayBuffer(file);
    } catch (error) {
      console.error(error);
      setMsgExcel("");
      setCargandoExcel(false);
      window.alert("❌ Error general al subir.");
      event.target.value = "";
    }
  };

  return (
    <div className="mt-8 p-6 text-center">
      <h2 className="text-2xl font-bold mb-4 text-green-700">Subir Nueva Cartera</h2>

      <input
        type="file"
        accept=".xlsx, .xls"
        onChange={handleFileUpload}
        className="block mx-auto mb-4"
        disabled={cargandoExcel}
      />

      {cargandoExcel && (
        <div className="max-w-xl mx-auto mt-3 text-left">
          <div className="text-sm font-semibold text-blue-700 mb-2">
            {msgExcel || "📥 Cargando Excel..."}
          </div>
          <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
            <div className="h-3 bg-blue-600 animate-pulse w-2/3" />
          </div>
          <div className="text-xs text-gray-500 mt-1">No cierres la pestaña mientras termina.</div>
        </div>
      )}

      <p className="text-gray-600 mt-3">
        Llave: <b>Póliza + Fecha de emisión</b> (en tu caso esta fecha es el <b>vencimiento del recibo</b>).<br />
        Semáforo: hoy o antes = vencida, 1-5 días = próxima, 6+ días = vigente.
      </p>
    </div>
  );
};

export default SubirCartera;