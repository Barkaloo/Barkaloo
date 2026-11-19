import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { ErrorBoundary } from "./components/ui";
import "katex/dist/katex.min.css";
import "./styles.css";
import "./teaching.css";
import "./decorations.css";
import "./auth.css";
import "./bank-editor.css";
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);
