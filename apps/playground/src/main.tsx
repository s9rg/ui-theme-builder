import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@s9rg/colorwheel/styles.css";
import "./styles.css";
import { Workbench } from "./workbench";

const root = document.getElementById("root");
if (root === null) throw new Error("UI Theme Builder root was not found");

createRoot(root).render(
  <StrictMode>
    <Workbench />
  </StrictMode>,
);
