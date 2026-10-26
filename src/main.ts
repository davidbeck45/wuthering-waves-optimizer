// @ts-nocheck
import { createApp } from "vue";
import "./style.css";
import "./sim/phone.css"; // Wuthering Tools+: phone-only overrides for upstream's components
import App from "./App.vue";
import { createWebHistory, createRouter } from "vue-router";
import FloatingVue from "floating-vue";
import "floating-vue/dist/style.css";
import { createPinia } from "pinia";
import { createPersistedState } from "pinia-plugin-persistedstate";
import { runMigrations } from "./migrations";
import { injectAnalytics } from "./utils/analytics";
import { installChunkReload } from "./sim/perf/chunkReload"; // Wuthering Tools+: a stale tab reloads once after a deploy

import HomeView from "./pages/HomeView.vue";
// Wuthering Tools+: every page but the calculator home loads on first visit, so the entry chunk only carries the
// calculator (src/sim/README.md, "Bundle diet").
const UpdatesView = () => import("./pages/UpdatesView.vue");
const InfoView = () => import("./pages/InfoView.vue");
const InfoOverview = () => import("./components/info/InfoOverview.vue");
const InfoCvRv = () => import("./components/info/InfoCvRv.vue");
const InfoTuningOdds = () => import("./components/info/InfoTuningOdds.vue");
const InfoFormulas = () => import("./components/info/InfoFormulas.vue");
const InfoCredits = () => import("./components/info/InfoCredits.vue");
const PrivacyView = () => import("./pages/PrivacyView.vue");
const SettingsView = () => import("./pages/SettingsView.vue");
const LegalView = () => import("./pages/LegalView.vue");
const InventoryView = () => import("./pages/InventoryView.vue");
const ConveneView = () => import("./pages/ConveneView.vue");
const TeamRotationsView = () => import("./pages/TeamRotationsView.vue");

const routes = [
  { path: "/", component: HomeView, name: "HomeView" },
  // { path: "/calculator", component: HomeView, name: 'HomeView' },
  // The optimizer lives in the calculator; old links to its placeholder page land there.
  { path: "/optimizer", redirect: "/" },
  { path: "/updates", component: UpdatesView, name: "UpdatesView" },
  // Children only render when the liveResultBar "UI Overhaul 3.0" flag is
  // on - InfoView.vue renders the full legacy article on every one of
  // these paths when the flag is off (see docs/adr/0024). This is the
  // first nested route in this router.
  {
    path: "/info",
    component: InfoView,
    name: "InfoView",
    children: [
      { path: "", component: InfoOverview, name: "InfoOverview" },
      { path: "cv-echo-rating", component: InfoCvRv, name: "InfoCvRv" },
      { path: "tuning-odds", component: InfoTuningOdds, name: "InfoTuningOdds" },
      { path: "formulas", component: InfoFormulas, name: "InfoFormulas" },
      { path: "credits", component: InfoCredits, name: "InfoCredits" },
    ],
  },
  { path: "/privacy", component: PrivacyView, name: "PrivacyView" },
  { path: "/settings", component: SettingsView, name: "SettingsView" },
  { path: "/legal", component: LegalView, name: "LegalView" },
  { path: "/inventory", component: InventoryView, name: "InventoryView" },
  { path: "/convene", component: ConveneView, name: "ConveneView" },
  { path: "/teams", component: TeamRotationsView, name: "TeamRotationsView" },
  // Wuthering Tools+: Riley31415/wuwa_calc's team comparison table + run detail pages, lazy so the
  // engine only loads when the page is opened (src/sim/rankings/).
  { path: "/rankings", component: () => import("./pages/RankingsView.vue"), name: "RankingsView" },
  { path: "/my-rankings", component: () => import("./sim/myRankings/MyRankingsView.vue"), name: "MyRankingsView" },
  // Wuthering Tools+: "My account", the account dashboard (src/sim/account/AccountView.vue)
  { path: "/account", component: () => import("./sim/account/AccountView.vue"), name: "AccountView" },

  // Wuthering Tools+: Echo Lab — engine-backed keep / tune / re-roll / feed decisions (src/sim/echoLab/)
  { path: "/echo-lab", component: () => import("./sim/echoLab/EchoLabView.vue"), name: "EchoLabView" },
];

const router = createRouter({
  history: createWebHistory("/"),
  routes,
});

injectAnalytics();
installChunkReload();

console.time("runMigrations");
// Upgrade persisted localStorage before Pinia hydrates stores from it
runMigrations();
console.timeEnd("runMigrations");

const pinia = createPinia();
pinia.use(
  createPersistedState({
    auto: true,
  }),
);

const app = createApp(App).use(pinia).use(router).use(FloatingVue);

import { useCharacterStore } from "./stores/character";
const characterStore = useCharacterStore();
import { useInventoryStore } from "./stores/inventory";
const inventoryStore = useInventoryStore();

// Count sessions still on the classic UI (ADR 0038). Needs Pinia, so after .use(pinia).
import { reportClassicUiSession } from "./composables/useClassicUi";
reportClassicUiSession();

// prevent bfcache
window.addEventListener("unload", () => {
  console.log("unloading app");
});

app.mount("#wt-app");
