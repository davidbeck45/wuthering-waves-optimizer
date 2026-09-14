// Wuthering Tools+ — the "team buffs from the team's members" switch for the Team Rotations pages
// and /my-rankings. Persisted per browser; off under Cypress so upstream's E2E numbers hold.
import { ref, watch } from "vue";

export const AUTO_TEAM_BUFFS_KEY = "wtplus:teamBuffs:auto";

function initial(): boolean {
  if (typeof window === "undefined") return true;
  if (window.Cypress) return false;
  try {
    const stored = localStorage.getItem(AUTO_TEAM_BUFFS_KEY);
    return stored == null ? true : stored === "1";
  } catch {
    return true;
  }
}

export const autoTeamBuffs = ref<boolean>(initial());

watch(autoTeamBuffs, (value) => {
  try {
    localStorage.setItem(AUTO_TEAM_BUFFS_KEY, value ? "1" : "0");
  } catch {
    // storage unavailable — the switch still works for this page load
  }
});
