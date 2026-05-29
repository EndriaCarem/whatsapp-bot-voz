import { useEffect, useState, useRef } from "react";
import "./App.css";

const BOT_URL = "http://localhost:3000";

export default function App() {
  const [qr, setQr]         = useState(null);
  const [status, setStatus] = useState("carregando...");
  const esRef = useRef(null);

  useEffect(() => {
    // Busca QR imediatamente ao abrir
    fetch(`${BOT_URL}/qr`)
      .then(r => r.json())
      .then(d => {
        if (d.state === "open") { setStatus("conectado"); return; }
        if (d.qr)               { setQr(d.qr); setStatus("escaneie o qr code"); return; }
        setStatus("aguardando qr...");
      })
      .catch(() => setStatus("⚠️ bot offline — rode npm start"));

    // SSE — recebe QR novo automaticamente quando expira
    if (esRef.current) esRef.current.close();
    const es = new EventSource(`${BOT_URL}/qr/stream`);
    esRef.current = es;

    es.onmessage = (e) => {
      const d = JSON.parse(e.data);
      if (d.state === "open")  { setStatus("conectado"); setQr(null); return; }
      if (d.qr)                { setQr(d.qr); setStatus("escaneie o qr code"); return; }
      setStatus("aguardando qr...");
    };
    es.onerror = () => setStatus("⚠️ bot offline — rode npm start");

    return () => es.close();
  }, []);

  return (
    <div className="page">
      <div className="card">
        <h1 className="title">🎙️ Bot de Voz</h1>
        <p className="subtitle">WhatsApp • EndriaCarem</p>

        <div className="qr-box">
          {status === "conectado" ? (
            <div className="connected">
              <span className="check">✅</span>
              <p className="conn-text">WhatsApp Conectado!</p>
              <p className="conn-sub">O bot está pronto no grupo.</p>
            </div>
          ) : qr ? (
            <img src={qr} alt="QR Code" className="qr-img" />
          ) : (
            <div className="loading">
              <div className="spinner" />
              <p className="loading-text">{status}</p>
            </div>
          )}
        </div>

        {qr && status !== "conectado" && (
          <p className="hint">
            WhatsApp → <b>Aparelhos conectados</b> → <b>Conectar aparelho</b>
          </p>
        )}

        <div className="commands">
          <p className="cmd-title">Comandos no grupo</p>
          {[
            ["!voz",     "abre menu de efeitos"],
            ["!demonio", "voz grave 😈"],
            ["!esquilo", "voz aguda 🐿️"],
            ["!robo",    "voz robótica 🤖"],
            ["!estadio", "reverb 🏟️"],
            ["!menu",    "ver todos"],
          ].map(([cmd, desc]) => (
            <div key={cmd} className="cmd-row">
              <code className="cmd">{cmd}</code>
              <span className="cmd-desc">{desc}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
