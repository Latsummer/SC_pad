(() => {
  "use strict";

  const STORAGE_KEY = "scminer-theme";
  const themes = [
    { id: "deep-space", name: "深空青", description: "默认的冷色矿业终端", color: "#27d7e7", themeColor: "#071114" },
    { id: "industrial-amber", name: "工业琥珀", description: "暖灰底的柔和设备界面", color: "#d29a4a", themeColor: "#0a0907" },
  ];

  function savedTheme() {
    try { return localStorage.getItem(STORAGE_KEY); } catch { return null; }
  }

  function applyTheme(id, persist = true) {
    const theme = themes.find((item) => item.id === id) || themes[0];
    document.documentElement.dataset.theme = theme.id;
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme.themeColor);
    if (persist) {
      try { localStorage.setItem(STORAGE_KEY, theme.id); } catch {}
    }
    document.querySelectorAll("[data-theme-option]").forEach((button) => {
      const selected = button.dataset.themeOption === theme.id;
      button.classList.toggle("active", selected);
      button.setAttribute("aria-checked", String(selected));
    });
    const trigger = document.querySelector("#themePickerToggle");
    if (trigger) trigger.title = `当前主题：${theme.name}`;
    return theme;
  }

  applyTheme(savedTheme() || themes[0].id, false);

  function mountPicker() {
    const actions = document.querySelector(".topbar-actions");
    if (!actions || document.querySelector("#themePicker")) return;
    const picker = document.createElement("div");
    picker.id = "themePicker";
    picker.className = "theme-picker";
    picker.innerHTML = `
      <button id="themePickerToggle" class="theme-picker-toggle" type="button" aria-label="选择界面主题" aria-controls="themePickerMenu" aria-expanded="false"><span aria-hidden="true">◐</span></button>
      <div id="themePickerMenu" class="theme-picker-menu" role="radiogroup" aria-label="界面主题" hidden>
        <div class="theme-picker-heading"><strong>外观主题</strong><small>选择后自动保存</small></div>
        ${themes.map((theme) => `<button type="button" role="radio" class="theme-option" data-theme-option="${theme.id}" aria-checked="false"><i style="--theme-swatch:${theme.color}" aria-hidden="true"></i><span><strong>${theme.name}</strong><small>${theme.description}</small></span><b aria-hidden="true">✓</b></button>`).join("")}
      </div>`;
    actions.prepend(picker);

    const trigger = picker.querySelector("#themePickerToggle");
    const menu = picker.querySelector("#themePickerMenu");
    const setOpen = (open) => {
      menu.hidden = !open;
      trigger.setAttribute("aria-expanded", String(open));
      picker.classList.toggle("open", open);
    };
    trigger.addEventListener("click", () => setOpen(menu.hidden));
    menu.addEventListener("click", (event) => {
      const option = event.target.closest("[data-theme-option]");
      if (!option) return;
      applyTheme(option.dataset.themeOption);
      setOpen(false);
      trigger.focus();
    });
    document.addEventListener("click", (event) => { if (!picker.contains(event.target)) setOpen(false); });
    document.addEventListener("keydown", (event) => { if (event.key === "Escape" && !menu.hidden) { setOpen(false); trigger.focus(); } });
    applyTheme(document.documentElement.dataset.theme, false);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mountPicker, { once: true });
  else mountPicker();

  window.SCMINER_THEME_MANAGER = { themes, apply: applyTheme };
})();
