"use client";

import { useEffect } from "react";

export default function GlobalError({
  error
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="es">
      <body style={{ margin: 0 }}>
        <main
          style={{
            alignItems: "center",
            background: "#f5f5ef",
            color: "#1f2a22",
            display: "flex",
            fontFamily: "Arial, sans-serif",
            justifyContent: "center",
            minHeight: "100vh",
            padding: "24px",
            textAlign: "center"
          }}
        >
          <div style={{ maxWidth: "480px" }}>
            <p style={{ color: "#477154", fontSize: "12px", fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase" }}>
              Mira
            </p>
            <h1 style={{ fontSize: "28px", fontWeight: 500, margin: "16px 0 0" }}>No pudimos mostrar esta pantalla</h1>
            <p style={{ color: "#667068", fontSize: "15px", lineHeight: 1.6, margin: "16px 0 0" }}>
              Recarga la aplicación para continuar. Tus datos guardados no se perderán.
            </p>
            <button
              onClick={() => window.location.reload()}
              style={{
                background: "#315f42",
                border: 0,
                borderRadius: "8px",
                color: "white",
                cursor: "pointer",
                fontSize: "14px",
                fontWeight: 600,
                marginTop: "24px",
                padding: "12px 18px"
              }}
              type="button"
            >
              Recargar aplicación
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}
