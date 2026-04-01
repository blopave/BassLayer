import { Component } from "react";

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
          height: "100vh", background: "#000", color: "#e5e5e5", fontFamily: "Space Grotesk, sans-serif",
          padding: "2rem", textAlign: "center",
        }}>
          <div style={{ fontSize: "1.4rem", fontWeight: 600, marginBottom: "0.75rem" }}>
            Algo salio mal
          </div>
          <div style={{ fontSize: "0.85rem", color: "#777", marginBottom: "1.5rem" }}>
            Hubo un error inesperado. Recarga la pagina para continuar.
          </div>
          <button
            onClick={() => window.location.reload()}
            style={{
              background: "transparent", border: "1px solid #333", color: "#e5e5e5",
              padding: "0.6rem 1.5rem", borderRadius: "6px", cursor: "pointer",
              fontFamily: "inherit", fontSize: "0.85rem",
            }}
          >
            Recargar
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
