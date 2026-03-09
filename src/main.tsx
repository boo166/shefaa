import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { useAuth } from "./core/auth/authStore";
import { initTheme } from "./hooks/useDarkMode";

// Apply theme class before anything renders (prevents flash)
initTheme();

// Initialize auth state on app load
useAuth.getState().initialize();

createRoot(document.getElementById("root")!).render(<App />);
