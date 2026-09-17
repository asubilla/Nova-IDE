import { useState } from "react";
import { ErrorBoundary } from "./components/ErrorBoundary";

function App() {
  const [count, setCount] = useState(0);

  return (
    <ErrorBoundary>
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          height: "100vh",
          fontFamily: "'JetBrains Mono', monospace",
          backgroundColor: "#1e1e2e",
          color: "#cdd6f4",
        }}
      >
        <h1>Nova IDE</h1>
        <button onClick={() => setCount((c) => c + 1)}>Count: {count}</button>
      </div>
    </ErrorBoundary>
  );
}

export default App;
