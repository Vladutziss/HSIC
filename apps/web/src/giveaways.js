// /ro/giveaways: the list of campaigns, read from the database (get_giveaways) so no deploy is needed to open or close one.
import { renderList, renderListError } from "./giveaway-view.js";
import { rpc } from "./api.js";

const root = document.getElementById("lista");

async function load() {
  root.innerHTML = `<p class="text-dim" role="status">Se încarcă campaniile…</p>`;
  try {
    const items = await rpc("get_giveaways");
    root.innerHTML = renderList(Array.isArray(items) ? items : []);
  } catch {
    root.innerHTML = renderListError();
  }
}

root.addEventListener("click", (e) => {
  if (e.target.closest("[data-action=retry]")) load();
});
load();
