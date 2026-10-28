import { initApp } from "./app.js";
import "maplibre-gl/dist/maplibre-gl.css";
import "./style.css";

const root = document.getElementById("root");
if (root) {
  initApp(root);
}
