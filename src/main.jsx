import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.jsx";
import { BrowserRouter, HashRouter } from "react-router-dom";

// 개발 모드에서는 StrictMode를 비활성화하여 WebRTC 연결 중복 문제 방지
const isDev = import.meta.env.DEV;
const AppWrapper = (
  <HashRouter>
    <App />
  </HashRouter>
);

createRoot(document.getElementById("root")).render(
  isDev ? AppWrapper : <StrictMode>{AppWrapper}</StrictMode>
);
