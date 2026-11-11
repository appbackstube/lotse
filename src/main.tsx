import ReactDOM from "react-dom/client";
import App from "./App";
import { initializeFileStore } from "./fileStore";

initializeFileStore().then(() => {
  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(<App />);
  requestAnimationFrame(() => requestAnimationFrame(() => {
    const boot = document.getElementById("lotse-boot");
    if (!boot) return;
    boot.style.opacity = "0";
    window.setTimeout(() => boot.remove(), 160);
  }));
}).catch((error) => {
  document.getElementById("root")!.textContent = `Cannot load app data: ${String(error)}`;
  document.getElementById("lotse-boot")?.remove();
});
