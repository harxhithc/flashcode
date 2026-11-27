/* @refresh reload */
import { render } from "solid-js/web";
import "./App.css";
import App from "./App";

const root = document.getElementById("root") as HTMLElement;
if (root) {
  root.innerHTML = "";
  render(() => <App />, root);
}
