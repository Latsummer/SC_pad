/*
 * Runs only when the user activates it on https://scmdb.net/?page=fab.
 * It records blueprint cards already rendered by SCMDB's public interface;
 * it never calls SCMDB APIs or fetches /data/ resources.
 */
(() => {
  "use strict";

  if (window.__SCMDB_PUBLIC_CAPTURE__) {
    window.__SCMDB_PUBLIC_CAPTURE__.show();
    return;
  }

  if (location.hostname !== "scmdb.net" || new URLSearchParams(location.search).get("page") !== "fab") {
    alert("请先打开 SCMDB 的 Fabricator 页面，再点击采集助手。");
    return;
  }

  const records = new Map();
  let paused = false;
  let captureTimer = 0;
  const pageUrl = location.href;

  const hash = (value) => {
    let result = 2166136261;
    for (let index = 0; index < value.length; index += 1) {
      result ^= value.charCodeAt(index);
      result = Math.imul(result, 16777619);
    }
    return (result >>> 0).toString(36);
  };

  const compact = (value) => value.replace(/\r/g, "").split("\n").map((line) => line.trim()).filter(Boolean).join("\n");

  function looksLikeBlueprintCard(text) {
    return text.length >= 20
      && text.length <= 1800
      && (/(?:\(\s*\d+(?:\.\d+)?\s*(?:SCU)?\)|\b\d+(?:\.\d+)?\s*SCU\b)/i.test(text))
      && (text.includes("⏱") || /\b\d+s\b/.test(text));
  }

  function captureVisibleCards() {
    if (paused) return;
    const candidates = [...document.querySelectorAll("main *, #app *, #root *")];
    candidates.forEach((element) => {
      const text = compact(element.innerText || "");
      if (!looksLikeBlueprintCard(text)) return;
      const key = hash(text);
      if (!records.has(key)) {
        records.set(key, { raw_text: text, captured_at: new Date().toISOString() });
      }
    });
    count.textContent = `${records.size} 条已记录`;
    exportButton.textContent = `导出 ${records.size} 条`;
  }

  function scheduleCapture() {
    window.clearTimeout(captureTimer);
    captureTimer = window.setTimeout(captureVisibleCards, 160);
  }

  const panel = document.createElement("section");
  panel.setAttribute("aria-label", "SCMDB 公开页面采集助手");
  panel.style.cssText = [
    "position:fixed", "right:16px", "bottom:16px", "z-index:2147483647",
    "width:min(310px,calc(100vw - 32px))", "padding:14px", "border:1px solid #35d9e8",
    "border-radius:12px", "background:#071114", "color:#e8f6f7", "box-shadow:0 12px 34px rgba(0,0,0,.45)",
    "font:13px system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",
  ].join(";");
  panel.innerHTML = `
    <strong style="display:block;margin-bottom:6px;color:#35d9e8">SCMDB 公开页面采集</strong>
    <p style="margin:0 0 8px;line-height:1.45;color:#b3c8ca">请缓慢向下滚动制造列表；助手只记录页面已显示的蓝图卡片。</p>
    <p id="scmdb-capture-count" style="margin:0 0 10px;font-weight:700">0 条已记录</p>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      <button type="button" data-action="pause">暂停</button>
      <button type="button" data-action="export">导出 0 条</button>
      <button type="button" data-action="close">关闭</button>
    </div>`;
  document.body.append(panel);

  const count = panel.querySelector("#scmdb-capture-count");
  const pauseButton = panel.querySelector('[data-action="pause"]');
  const exportButton = panel.querySelector('[data-action="export"]');

  [pauseButton, exportButton, panel.querySelector('[data-action="close"]')].forEach((button) => {
    button.style.cssText = "min-height:34px;padding:0 10px;border:1px solid #2c7980;border-radius:7px;background:#0c2024;color:#e8f6f7;font:inherit;font-weight:700;cursor:pointer";
  });

  pauseButton.addEventListener("click", () => {
    paused = !paused;
    pauseButton.textContent = paused ? "继续" : "暂停";
    if (!paused) captureVisibleCards();
  });

  exportButton.addEventListener("click", () => {
    captureVisibleCards();
    const payload = {
      format: "scmdb-public-fabricator-capture-v1",
      source_url: pageUrl,
      captured_at: new Date().toISOString(),
      note: "Captured from SCMDB's public rendered Fabricator page. No /data/ endpoint was requested by this helper.",
      cards: [...records.values()],
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `scmdb-public-fabricator-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
  });

  panel.querySelector('[data-action="close"]').addEventListener("click", () => {
    observer.disconnect();
    window.removeEventListener("scroll", scheduleCapture, true);
    panel.remove();
    delete window.__SCMDB_PUBLIC_CAPTURE__;
  });

  const observer = new MutationObserver(scheduleCapture);
  observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  window.addEventListener("scroll", scheduleCapture, true);
  window.__SCMDB_PUBLIC_CAPTURE__ = { show: () => panel.removeAttribute("hidden") };
  captureVisibleCards();
})();
