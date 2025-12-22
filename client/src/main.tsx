import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import "./lib/i18n";

// Service worker removed for development stability

createRoot(document.getElementById("root")!).render(<App />);
