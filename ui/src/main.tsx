import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { installConsoleForwarder } from "./lib/diag-log";
// Inter(OFSL-1.1,无许可负担):@font-face 注入,供 --font-sans 真正生效。
import "@fontsource-variable/inter";
import "./index.css";

// 渲染前先装好错误→stderr 桥,使打包后从命令行启动即可看到 webview 运行时报错。
installConsoleForwarder();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
