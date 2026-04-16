import { useEffect } from "react";
import { FloatingPanel } from "./components/FloatingPanel";
import { useAppBootstrap } from "./hooks/useAppBootstrap";

function App() {
  useAppBootstrap();
  // Silence unused-effect warning in StrictMode — hooks handle their own cleanup.
  useEffect(() => undefined, []);
  return <FloatingPanel />;
}

export default App;
