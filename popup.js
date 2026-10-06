const form = document.getElementById("add-form");
const handleInput = document.getElementById("handle-input");
const notifyCheck = document.getElementById("notify-check");
const autoOpenCheck = document.getElementById("autoopen-check");
const list = document.getElementById("list");
const empty = document.getElementById("empty");
const checkNowBtn = document.getElementById("check-now");
const checkStatus = document.getElementById("check-status");
const intervalInput = document.getElementById("interval-input");
const tabs = document.querySelectorAll(".tab");
const themeBtn = document.getElementById("theme-btn");
const permBanner = document.getElementById("perm-banner");
const permBtn = document.getElementById("perm-btn");
const resetBtn = document.getElementById("reset-btn");

const ALL_ORIGINS = ["https://www.youtube.com/*", "https://www.twitch.tv/*", "https://kick.com/*"];

let currentPlatform = "youtube";

const ICON_PATHS = {
  bellOn: `<path d="M10 5a2 2 0 1 1 4 0a7 7 0 0 1 4 6v3a4 4 0 0 0 2 3h-16a4 4 0 0 0 2 -3v-3a7 7 0 0 1 4 -6" /><path d="M9 17v1a3 3 0 0 0 6 0v-1" />`,
  bellOff: `<path d="M3 3l18 18" /><path d="M10 5a2 2 0 0 1 3.585 -1.133l.015 .013a7 7 0 0 1 4.4 6.12l0 .28v3m2 2h-16a4 4 0 0 0 2 -3v-3a7 7 0 0 1 .12 -1.27" /><path d="M9 17v1a3 3 0 0 0 6 0v-1" />`,
  linkOn: `<path d="M9 15l6 -6" /><path d="M11 6l.463 -.536a5 5 0 0 1 7.071 7.072l-.534 .464" /><path d="M13 18l-.397 .534a5.068 5.068 0 0 1 -7.127 0a4.972 4.972 0 0 1 0 -7.071l.524 -.463" />`,
  linkOff: `<path d="M9 15l3 -3m2 -2l1 -1" /><path d="M11 6l.463 -.536a5 5 0 0 1 7.071 7.072l-.534 .464" /><path d="M3 3l18 18" /><path d="M13 18l-.397 .534a5.068 5.068 0 0 1 -7.127 0a4.972 4.972 0 0 1 0 -7.071l.524 -.463" />`,
  videoAuto: `<path d="M12 20h-7a2 2 0 0 1 -2 -2v-9a2 2 0 0 1 2 -2h1a2 2 0 0 0 2 -2a1 1 0 0 1 1 -1h6a1 1 0 0 1 1 1a2 2 0 0 0 2 2h1a2 2 0 0 1 2 2v3.5" /><path d="M12 16a3 3 0 1 0 0 -6a3 3 0 0 0 0 6z" /><path d="M19 22v-6" /><path d="M22 19l-3 -3l-3 3" />`,
  menu: `<path d="M10 6h10" /><path d="M4 12h16" /><path d="M7 12h13" /><path d="M4 18h10" />`,
  search: `<path d="M10 10m-7 0a7 7 0 1 0 14 0a7 7 0 1 0 -14 0" /><path d="M21 21l-6 -6" />`,
  trash: `<path d="M4 7l16 0" /><path d="M10 11l0 6" /><path d="M14 11l0 6" /><path d="M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2 -2l1 -12" /><path d="M9 7v-3a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v3" />`,
  pause: `<path d="M6 5m0 1a1 1 0 0 1 1 -1h2a1 1 0 0 1 1 1v12a1 1 0 0 1 -1 1h-2a1 1 0 0 1 -1 -1z" /><path d="M14 5m0 1a1 1 0 0 1 1 -1h2a1 1 0 0 1 1 1v12a1 1 0 0 1 -1 1h-2a1 1 0 0 1 -1 -1z" />`,
  play: `<path d="M7 4v16l13 -8z" />`,
  close: `<path d="M18 6l-12 12" /><path d="M6 6l12 12" />`,
  sun: `<path d="M12 12m-4 0a4 4 0 1 0 8 0a4 4 0 1 0 -8 0" /><path d="M3 12h1m8 -9v1m8 8h1m-9 8v1m-6.4 -15.4l.7 .7m12.1 -.7l-.7 .7m0 11.4l.7 .7m-12.1 -.7l-.7 .7" />`,
  moon: `<path d="M12 3c.132 0 .263 0 .393 0a7.5 7.5 0 0 0 7.92 12.446a9 9 0 1 1 -8.313 -12.454z" />`,
  themeAuto: `<path d="M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0 -18 0" /><path d="M12 3v18" /><path d="M12 9l4.65 -4.65" /><path d="M12 14.3l7.37 -7.37" /><path d="M12 19.6l8.85 -8.85" />`,
};

function initialOf(handle) {
  const c = (handle || "").replace("@", "").trim().charAt(0);
  return c ? c.toUpperCase() : "?";
}

function svgIcon(name, size = 16) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICON_PATHS[name]}</svg>`;
}

async function getChannels() {
  const { channels = [] } = await chrome.storage.local.get("channels");
  return channels;
}

async function saveChannels(channels) {
  await chrome.storage.local.set({ channels });
  render();
}

async function loadSettings() {
  const { settings } = await chrome.storage.local.get("settings");
  if (settings && settings.interval) intervalInput.value = settings.interval;
}

const THEME_ORDER = ["auto", "light", "dark"];
const THEME_LABEL = { auto: "Tema: automático", light: "Tema: claro", dark: "Tema: escuro" };
const THEME_ICON = { auto: "themeAuto", light: "sun", dark: "moon" };

function applyTheme(theme) {
  if (theme === "light" || theme === "dark") document.documentElement.setAttribute("data-theme", theme);
  else document.documentElement.removeAttribute("data-theme");
  themeBtn.innerHTML = svgIcon(THEME_ICON[theme] || "themeAuto", 14);
  themeBtn.title = THEME_LABEL[theme] || THEME_LABEL.auto;
}

async function loadTheme() {
  const { settings = {} } = await chrome.storage.local.get("settings");
  applyTheme(settings.theme || "auto");
}

themeBtn.addEventListener("click", async () => {
  const { settings = {} } = await chrome.storage.local.get("settings");
  const current = settings.theme || "auto";
  const next = THEME_ORDER[(THEME_ORDER.indexOf(current) + 1) % THEME_ORDER.length];
  await chrome.storage.local.set({ settings: { ...settings, theme: next } });
  applyTheme(next);
});

async function checkPermissions() {
  const ok = await chrome.permissions.contains({ origins: ALL_ORIGINS });
  permBanner.style.display = ok ? "none" : "flex";
  return ok;
}

permBtn.addEventListener("click", () => {

  chrome.permissions.request({ origins: ALL_ORIGINS }, async (granted) => {
    await checkPermissions();
    if (granted) runCheckAll();
  });
});

function sendToBackground(msg, timeoutMs = 30000) {
  return new Promise((resolve) => {
    let finished = false;
    const timer = setTimeout(() => {
      if (!finished) { finished = true; resolve({ timeout: true }); }
    }, timeoutMs);
    chrome.runtime.sendMessage(msg, (res) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      const err = chrome.runtime.lastError;
      resolve(err ? { error: err.message } : res || {});
    });
  });
}

async function runCheckAll() {
  checkStatus.textContent = "verificando...";
  const res = await sendToBackground({ type: "CHECK_NOW" }, 120000);
  checkStatus.textContent = res.error
    ? "erro: " + res.error
    : res.timeout
    ? "demorou demais"
    : "";
  render();
}

intervalInput.addEventListener("change", async (e) => {
  const newInterval = parseInt(e.target.value) || 5;
  const { settings = {} } = await chrome.storage.local.get("settings");
  await chrome.storage.local.set({ settings: { ...settings, interval: newInterval } });
  chrome.runtime.sendMessage({ type: "UPDATE_ALARM" });
});

tabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    tabs.forEach((t) => t.classList.remove("active"));
    tab.classList.add("active");
    currentPlatform = tab.getAttribute("data-platform");
    handleInput.placeholder =
      currentPlatform === "twitch"
        ? "nome do canal na Twitch"
        : currentPlatform === "kick"
        ? "nome do canal na Kick"
        : "@canal ou url";
    openMenuHandle = null;
    render();
  });
});

function normalizeHandle(raw, platform) {
  let h = raw.trim();
  if (!h) return null;
  if (platform === "youtube" && !h.startsWith("@")) h = "@" + h;
  if ((platform === "twitch" || platform === "kick") && h.startsWith("@")) h = h.substring(1);
  return h;
}

function timeAgo(ts) {
  if (!ts) return "nunca verificado";
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 60) return "verificado agora";
  if (diff < 3600) return `verificado há ${Math.floor(diff / 60)} min`;
  return `verificado há ${Math.floor(diff / 3600)} h`;
}

function timeAlive(ts) {
  if (!ts) return "";
  const diffMin = Math.floor((Date.now() - ts) / 60000);
  if (diffMin < 60) return `Em live há ${diffMin} min`;
  const hrs = Math.floor(diffMin / 60);
  const mins = diffMin % 60;
  return `Em live há ${hrs}h ${mins}m`;
}

function closeAnyMenu() {
  const existing = document.getElementById("options-overlay");
  if (existing) existing.remove();
}

async function saveChannelsQuiet(channels) {
  await chrome.storage.local.set({ channels });
}

function openOptionsPanel(ch, allChannels) {
  closeAnyMenu();

  const overlay = document.createElement("div");
  overlay.className = "overlay";
  overlay.id = "options-overlay";
  overlay.onclick = (e) => {
    if (e.target === overlay) closeOptionsPanel();
  };

  const panel = document.createElement("div");
  panel.className = "options-panel";
  overlay.appendChild(panel);

  const header = document.createElement("div");
  header.className = "options-panel-header";
  const title = document.createElement("span");
  title.className = "title";
  title.textContent = ch.handle;
  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "close-btn";
  closeBtn.innerHTML = svgIcon("close", 16);
  closeBtn.title = "Fechar";
  closeBtn.onclick = () => closeOptionsPanel();
  header.append(title, closeBtn);
  panel.appendChild(header);

  function addItem({ getIcon, getLabel, getChecked, onToggle }) {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "item";

    const labelWrap = document.createElement("span");
    labelWrap.className = "menu-item-label";
    const iconSpan = document.createElement("span");
    const textSpan = document.createElement("span");
    labelWrap.append(iconSpan, textSpan);
    item.append(labelWrap);

    let sw = null;
    if (getChecked) {
      sw = document.createElement("span");
      sw.className = "switch";
      sw.style.pointerEvents = "none";
      item.append(sw);
    }

    function refresh() {
      iconSpan.innerHTML = svgIcon(getIcon(), 14);
      textSpan.textContent = getLabel();
      if (sw) sw.innerHTML = `<input type="checkbox" ${getChecked() ? "checked" : ""}><span class="track"></span>`;
    }
    refresh();

    item.onclick = async (ev) => {
      ev.stopPropagation();
      onToggle();
      await saveChannelsQuiet(allChannels);
      refresh();
    };

    panel.appendChild(item);
  }

  addItem({
    getIcon: () => (ch.paused ? "play" : "pause"),
    getLabel: () => (ch.paused ? "Retomar monitoramento" : "Pausar monitoramento"),
    onToggle: () => {
      ch.paused = !ch.paused;
    },
  });

  addItem({
    getIcon: () => (ch.autoOpen ? "linkOn" : "linkOff"),
    getLabel: () => "Abrir automaticamente",
    getChecked: () => ch.autoOpen,
    onToggle: () => {
      ch.autoOpen = !ch.autoOpen;
    },
  });

  if (ch.platform === "youtube") {
    addItem({
      getIcon: () => "videoAuto",
      getLabel: () => "Notificar novos vídeos",
      getChecked: () => ch.notifyVideos,
      onToggle: () => {
        ch.notifyVideos = !ch.notifyVideos;
      },
    });
    addItem({
      getIcon: () => "videoAuto",
      getLabel: () => "Abrir vídeo novo automaticamente",
      getChecked: () => ch.autoOpenVideos,
      onToggle: () => {
        ch.autoOpenVideos = !ch.autoOpenVideos;
      },
    });
  }

  if (ch.platform === "youtube" && (ch.notifyVideos || ch.autoOpenVideos) && ch.videoError) {
    const note = document.createElement("div");
    note.style.cssText = "padding:10px 16px;font-size:11px;color:var(--danger);border-top:1px solid var(--divider)";
    note.textContent = "Último erro nos vídeos: " + ch.videoError;
    panel.appendChild(note);
  }

  document.body.appendChild(overlay);
}

function closeOptionsPanel() {
  closeAnyMenu();
  render();
}

async function render() {
  const allChannels = await getChannels();
  const channels = allChannels.filter((c) => (c.platform || "youtube") === currentPlatform);

  list.innerHTML = "";
  empty.style.display = channels.length === 0 ? "block" : "none";

  for (const ch of channels) {
    const row = document.createElement("div");
    row.className = "channel" + (ch.paused ? " paused" : "") + (ch.isLive && !ch.paused ? " live" : "");

    const avatar = document.createElement("div");
    avatar.className = "avatar";
    if (ch.avatarUrl) {
      const img = document.createElement("img");
      img.src = ch.avatarUrl;
      img.alt = "";
      img.onerror = () => {

        avatar.innerHTML = "";
        avatar.textContent = initialOf(ch.handle);
      };
      avatar.appendChild(img);
    } else {
      avatar.textContent = initialOf(ch.handle);
    }

    const info = document.createElement("div");
    info.className = "info";

    const handleEl = document.createElement("span");
    handleEl.className = "handle";
    handleEl.textContent = ch.handle;

    const statusEl = document.createElement("div");
    statusEl.className = "status" + (ch.isLive ? " live-status" : "");
    if (ch.paused) {
      statusEl.textContent = "pausado";
    } else if (ch.isLive) {
      statusEl.textContent = ch.liveSince ? timeAlive(ch.liveSince) : "AO VIVO";
    } else if (ch.lastError) {
      statusEl.textContent = "erro: " + ch.lastError;
      statusEl.title = ch.lastError;
      statusEl.classList.add("error-status");
    } else {
      statusEl.textContent = timeAgo(ch.lastChecked);
    }

    const meta = document.createElement("div");
    meta.className = "meta";
    if (ch.isLive && !ch.paused) {
      const dot = document.createElement("span");
      dot.className = "live-dot";
      meta.append(dot);
    }
    meta.append(statusEl);

    info.append(handleEl, meta);
    row.append(avatar, info);

    const actions = document.createElement("div");
    actions.className = "actions";

    const watchBtn = document.createElement("button");
    watchBtn.type = "button";
    watchBtn.className = "icon-btn" + (ch.isLive ? " on" : " disabled");
    watchBtn.innerHTML = svgIcon("play", 14);
    watchBtn.title = ch.isLive ? "Assistir agora" : "Canal offline";
    watchBtn.onclick = () => {
      if (ch.isLive && ch.liveUrl) window.open(ch.liveUrl, "_blank");
    };

    const notifyBtn = document.createElement("button");
    notifyBtn.type = "button";
    notifyBtn.className = "icon-btn" + (ch.notify ? " on" : "");
    notifyBtn.innerHTML = svgIcon(ch.notify ? "bellOn" : "bellOff", 14);
    notifyBtn.title = ch.notify ? "Notificação ligada" : "Notificação desligada";
    notifyBtn.onclick = async () => {
      ch.notify = !ch.notify;
      await saveChannels(allChannels);
    };

    const checkBtn = document.createElement("button");
    checkBtn.type = "button";
    const isChecking = ch.checkingSince && Date.now() - ch.checkingSince < 60000;
    checkBtn.className = "icon-btn" + (isChecking ? " checking" : "");
    checkBtn.innerHTML = svgIcon("search", 14);
    checkBtn.title = "Verificar este canal agora";
    checkBtn.onclick = async () => {
      checkBtn.classList.add("checking");

      const res = await sendToBackground({ type: "CHECK_ONE", handle: ch.handle, platform: ch.platform }, 60000);
      if (res.error) checkStatus.textContent = "erro: " + res.error;
      render();
    };

    const menuBtn = document.createElement("button");
    menuBtn.type = "button";
    menuBtn.className = "icon-btn";
    menuBtn.innerHTML = svgIcon("menu", 14);
    menuBtn.title = "Mais opções";
    menuBtn.onclick = (e) => {
      e.stopPropagation();
      openOptionsPanel(ch, allChannels);
    };

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "icon-btn remove";
    removeBtn.innerHTML = svgIcon("trash", 14);
    removeBtn.title = "Remover";
    removeBtn.onclick = async () => {
      const updated = allChannels.filter((c) => !(c.handle === ch.handle && c.platform === ch.platform));
      await saveChannels(updated);
    };

    actions.append(watchBtn, notifyBtn, checkBtn, menuBtn, removeBtn);
    row.append(actions);
    list.appendChild(row);
  }
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const handle = normalizeHandle(handleInput.value, currentPlatform);
  if (!handle) return;

  const channels = await getChannels();
  if (channels.some((c) => c.handle === handle && c.platform === currentPlatform)) {
    handleInput.value = "";
    return;
  }

  channels.push({
    platform: currentPlatform,
    handle,
    notify: notifyCheck.checked,
    autoOpen: autoOpenCheck.checked,
    paused: false,
    isLive: false,
    lastChecked: null,
    liveUrl: null,
    liveSince: null,
    notifyVideos: false,
    autoOpenVideos: false,
    channelId: null,
    lastVideoId: null,
    lastVideoUrl: null,
    lastVideoTitle: null,
    avatarUrl: null,
  });
  await saveChannels(channels);
  handleInput.value = "";

  runCheckAll();
});

checkNowBtn.addEventListener("click", runCheckAll);

let resetArmedTimer = null;
resetBtn.addEventListener("click", async () => {
  if (!resetBtn.classList.contains("confirm")) {
    resetBtn.classList.add("confirm");
    resetBtn.textContent = "Confirmar?";
    resetArmedTimer = setTimeout(() => {
      resetBtn.classList.remove("confirm");
      resetBtn.textContent = "Resetar";
    }, 4000);
    return;
  }
  clearTimeout(resetArmedTimer);
  resetBtn.classList.remove("confirm");
  resetBtn.textContent = "Resetar";
  closeAnyMenu();
  checkStatus.textContent = "resetando...";
  const res = await sendToBackground({ type: "RESET" }, 15000);
  checkStatus.textContent = res.error ? "erro: " + res.error : "resetado, verificando...";
  setTimeout(() => {
    if (checkStatus.textContent.startsWith("resetado")) checkStatus.textContent = "";
  }, 6000);
  render();
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.channels && !document.getElementById("options-overlay")) render();
});

setInterval(() => {
  if (!document.getElementById("options-overlay")) render();
}, 5000);

loadTheme();
loadSettings();
checkPermissions();
render();
