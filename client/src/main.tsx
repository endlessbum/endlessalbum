import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { applyUiFont, getStoredUiFont } from "./lib/fonts";

const storedFont = getStoredUiFont();
if (storedFont) applyUiFont(storedFont);

createRoot(document.getElementById("root")!).render(<App />);
