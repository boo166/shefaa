import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { useAuth } from "./core/auth/authStore";

// Initialize auth state on app load
useAuth.getState().initialize();

createRoot(document.getElementById("root")!).render(<App />);
