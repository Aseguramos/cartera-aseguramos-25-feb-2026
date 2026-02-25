import React, { useState, useEffect } from "react";
import { db } from "./firebase";

import {
  collection,
  getDocs,
  addDoc,
  updateDoc,
  doc,
  onSnapshot,
} from "firebase/firestore";

const refFinanciadas = collection(db, "polizasFinanciadas");

function getSemaforo(poliza) {

  if (poliza.endoso === "") return "rojo";

  const baseCompleta =
    poliza.montada &&
    poliza.recaudada &&
    poliza.firmada &&
    poliza.desembolsada;

  const baseParcial =
    poliza.montada ||
    poliza.recaudada ||
    poliza.firmada ||
    poliza.desembolsada;

  // 🟡 Delegada
  if (poliza.delegada) {
    if (poliza.endoso === "SI") {
      if (baseCompleta && poliza.certificacion && poliza.correoEndoso) return "verde";
    } else {
      if (baseCompleta) return "verde";
    }
    return "amarillo";
  }

  // 🟣 ENDOSO SI
  if (poliza.endoso === "SI") {
    if (baseCompleta && poliza.certificacion && poliza.correoEndoso) return "verde";
    if (baseParcial || poliza.certificacion) return "amarillo";
    return "rojo";
  }

  // 🟢 ENDOSO NO
  if (baseCompleta) return "verde";
  if (baseParcial) return "amarillo";

  return "rojo";
}

export default function PolizasFinanciadas() {

  const refFinanciadas = collection(db, "polizasFinanciadas");

  const entidadesLista = [
    "Finesa","Previcredito","Crediestado","Credivalores",
    "ALLIANZ","ESTADO","SURA","MUNDIAL","PREVISORA",
    "AXA COLPATRIA","MAPFRE","SBS","SOLIDARIA","HDI"
  ];

  const aseguradorasLista = [
    "ALLIANZ","ESTADO","SURA","MUNDIAL","PREVISORA",
    "AXA COLPATRIA","MAPFRE","SBS","SOLIDARIA","HDI"
  ];

  const [carteraReal, setCarteraReal] = useState([]);

  useEffect(() => {
    const cargarCartera = async () => {
      const querySnapshot = await getDocs(collection(db, "cartera"));
      const datos = querySnapshot.docs.map(doc => doc.data());
      setCarteraReal(datos);
    };


    
    cargarCartera();
  }, []);
const [polizas, setPolizas] = useState(() => {
  const guardadas = localStorage.getItem("polizasFinanciadasJL");
  return guardadas
    ? JSON.parse(guardadas)
    : [{
        id: 1,
        numeroPoliza: "",
        fecha: "2026-02-10",
        placa: "",
        nombre: "",
        entidad: "Finesa",
        aseguradora: "SURA",
        gestor: "",
        cuotas:1,
        valor:"",
        montada:false,
        recaudada:false,
        firmada:false,
        endoso:"",
        certificacion:false,
        correoEndoso:false,
        desembolsada:false,
        delegada:false,
        delegadaA:""
      }];
});

useEffect(() => {

  const unsubscribe = onSnapshot(refFinanciadas, (snap) => {

    const datos = snap.docs
      .map(doc => ({ id: doc.id, ...doc.data() }))
      .filter(p => p.tipo === "financiada");

    if (datos.length > 0) {
      setPolizas(datos);
      localStorage.setItem("polizasFinanciadasJL", JSON.stringify(datos));
    }
  });

  return () => unsubscribe();

}, []);

// 💾 GUARDADO AUTOMATICO LOCAL (NO SE BORRAN AL CAMBIAR PESTAÑA)
useEffect(()=>{
  localStorage.setItem(
    "polizasFinanciadasJL",
    JSON.stringify(polizas)
  );
},[polizas]);


const agregarPoliza = async () => {

  const nueva = {
    id: Date.now(),
    numeroPoliza: "",
    fecha: "",
    placa: "",
    nombre: "",
    entidad: "Finesa",
    aseguradora: "SURA",
    gestor: "",
    cuotas: 1,
    valor: "",
    montada:false,
    recaudada:false,
    firmada:false,
    endoso:"",
    certificacion:false,
    correoEndoso:false,
    desembolsada:false,
    delegada:false,
    delegadaA:""
  };

  try {

   // 🔥 GUARDAR EN FIREBASE
console.log("🔥 Intentando guardar en Firebase...");
console.log("🔥 DB:", db);

const docRef = await addDoc(refFinanciadas, {
  ...nueva,
  tipo: "financiada"
});

    // 🔥 GUARDAR TAMBIÉN EN PANTALLA
    setPolizas(prev => [
      ...prev,
      { ...nueva, idFirestore: docRef.id }
    ]);

    console.log("🔥 Guardado en Firebase OK");

  } catch (error) {
    console.error("❌ Error guardando en Firebase:", error);
  }
};

  const eliminarPoliza = (id) => {
    setPolizas(prev => prev.filter(p => p.id !== id));
  };

  return (
    <div className="pl-0 pr-4 pt-4 pb-4 w-full text-left">
      <h2 className="text-xl font-bold mb-4">Pólizas Financiadas</h2>

      <button
        onClick={agregarPoliza}
        className="mb-4 bg-green-600 text-white px-4 py-2 rounded-lg"
      >
        + Póliza Nueva
      </button>

      <table className="w-full border table-auto -ml-64">
        <thead className="bg-gray-100">
          <tr>
            <th>Estado</th>
            <th>Fecha</th>
            <th>Póliza</th>
            <th>Aseguradora</th>
            <th>Placa</th>
            <th>Nombre</th>
            <th>Entidad</th>
            <th>cuotas</th>
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
            <th>Accion</th>
          </tr>
        </thead>

        <tbody>
          {polizas.map(p => {
            const estado = getSemaforo(p);

            return (
              <tr key={p.id} className="border-b">

                <td>
                 <div className="flex items-start gap-3">

  {/* 🔵 SEMÁFORO GENERAL GRANDE */}
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
  </div>

  {/* 🧾 DETALLE PROCESO */}
  <div className="flex flex-col gap-1 text-xs">

                   

                    {p.montada && <span className="text-blue-600">🔵 Montada</span>}
                    {p.recaudada && <span className="text-purple-600">🟣 Recaudada</span>}
                    {p.firmada && <span className="text-green-600">🟢 Firmada</span>}
                    {p.desembolsada && <span className="text-green-700">💰 Desembolsada</span>}

                    {p.endoso==="SI" && !p.certificacion && p.desembolsada &&
                      <span className="text-orange-500">📄 Certificación pendiente</span>
                    }
                    {p.endoso === "SI" && p.certificacion && !p.correoEndoso && (
  <span className="text-orange-500">📩 Correo Endoso pendiente</span>
)}

                    {estado==="verde" &&
                      <span className="text-green-700 font-semibold">
                        ✔ PROCESO FINALIZADO
                      </span>
                    }

                  </div>
                </td>

                <td>
                  <input type="date"
                    value={p.fecha}
                    onChange={(e)=>setPolizas(prev=>prev.map(pol=>pol.id===p.id?{...pol,fecha:e.target.value}:pol))}
                    className="border rounded px-2 py-1"/>
                </td>

                <td>
                  <input
                    value={p.numeroPoliza}
                    onChange={(e)=>setPolizas(prev=>prev.map(pol=>pol.id===p.id?{...pol,numeroPoliza:e.target.value}:pol))}
                    className="border rounded px-2 py-1 w-28"/>
                </td>

                <td>
                  <select value={p.aseguradora}
                    onChange={(e)=>setPolizas(prev=>prev.map(pol=>pol.id===p.id?{...pol,aseguradora:e.target.value}:pol))}
                    className="border rounded px-2 py-1">
                    {aseguradorasLista.map(a=><option key={a}>{a}</option>)}
                  </select>
                </td>

                <td>
                  <input value={p.placa}
                    onChange={(e)=>setPolizas(prev=>prev.map(pol=>pol.id===p.id?{...pol,placa:e.target.value.toUpperCase()}:pol))}
                    className="border rounded px-2 py-1 w-24"/>
                </td>

                <td>
                  <input value={p.nombre}
                    onChange={(e)=>setPolizas(prev=>prev.map(pol=>pol.id===p.id?{...pol,nombre:e.target.value}:pol))}
                    className="border rounded px-2 py-1 w-32"/>
                </td>

                <td>
                  <select value={p.entidad}
                    onChange={(e)=>setPolizas(prev=>prev.map(pol=>pol.id===p.id?{...pol,entidad:e.target.value}:pol))}
                    className="border rounded px-2 py-1">
                    {entidadesLista.map(ent=><option key={ent}>{ent}</option>)}
                  </select>
                </td>

                <td>
                  <select value={p.cuotas}
                    onChange={(e)=>setPolizas(prev=>prev.map(pol=>pol.id===p.id?{...pol,cuotas:Number(e.target.value)}:pol))}
                    className="border rounded px-2 py-1">
                    {[...Array(12)].map((_,i)=><option key={i+1}>{i+1}</option>)}
                  </select>
                </td>

                <td>
                  <input value={p.valor}
                    onChange={(e)=>setPolizas(prev=>prev.map(pol=>pol.id===p.id?{...pol,valor:e.target.value}:pol))}
                    className="border rounded px-2 py-1 w-28"/>
                </td>

                <td className="text-center">
                  <input type="checkbox" checked={p.montada}
                    onChange={(e)=>setPolizas(prev=>prev.map(pol=>pol.id===p.id?{...pol,montada:e.target.checked}:pol))}/>
                </td>

                <td className="text-center">
                  <input type="checkbox" checked={p.recaudada}
                    disabled={!p.montada}
                    onChange={(e)=>setPolizas(prev=>prev.map(pol=>pol.id===p.id?{...pol,recaudada:e.target.checked}:pol))}/>
                </td>

                <td className="text-center">
                  <input type="checkbox" checked={p.firmada}
                    disabled={!p.recaudada}
                    onChange={(e)=>setPolizas(prev=>prev.map(pol=>pol.id===p.id?{...pol,firmada:e.target.checked}:pol))}/>
                </td>

                <td className="text-center">
                  <input type="checkbox" checked={p.desembolsada}
                    disabled={!p.montada || !p.recaudada || !p.firmada}
                    onChange={(e)=>setPolizas(prev=>prev.map(pol=>pol.id===p.id?{...pol,desembolsada:e.target.checked}:pol))}/>
                </td>

                <td className="text-center">
                  <select value={p.endoso}
                    onChange={(e)=>setPolizas(prev=>prev.map(pol=>pol.id===p.id?{...pol,endoso:e.target.value}:pol))}
                    className="border rounded px-1">
                    <option value="">-</option>
                    <option value="SI">SI</option>
                    <option value="NO">NO</option>
                  </select>
                </td>

                <td className="text-center">
                  {p.endoso==="SI" &&
                    <input type="checkbox"
                      checked={p.certificacion}
                      disabled={!p.desembolsada}
                      onChange={(e)=>setPolizas(prev=>prev.map(pol=>pol.id===p.id?{...pol,certificacion:e.target.checked}:pol))}/>
                  }
                </td>
{/* 🆕 CORREO ENDOSO */}
<td className="text-center">
  {p.endoso==="SI" && p.certificacion && (
    <select
      value={p.correoEndoso ? "SI" : "NO"}
      onChange={(e)=>{
        setPolizas(prev=>prev.map(pol =>
          pol.id===p.id
            ? {...pol, correoEndoso: e.target.value==="SI"}
            : pol
        ))
      }}
      className="border rounded px-1"
    >
      <option value="NO">NO</option>
      <option value="SI">SI</option>
    </select>
  )}
</td>

                <td className="text-center">
                  <input type="checkbox" checked={p.delegada}
                    onChange={(e)=>setPolizas(prev=>prev.map(pol=>pol.id===p.id?{...pol,delegada:e.target.checked}:pol))}/>
                </td>

                <td>
                  <input value={p.delegadaA}
                    onChange={(e)=>setPolizas(prev=>prev.map(pol=>pol.id===p.id?{...pol,delegadaA:e.target.value}:pol))}
                    className="border rounded px-2 py-1 w-32"/>
                </td>

                <td>
                  <input value={p.gestor}
                    onChange={(e)=>setPolizas(prev=>prev.map(pol=>pol.id===p.id?{...pol,gestor:e.target.value}:pol))}
                    className="border rounded px-2 py-1 w-32"/>
                </td>

                <td>
                  <button onClick={()=>eliminarPoliza(p.id)}
                    className="text-red-600 font-bold px-2">X</button>
                </td>

              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

