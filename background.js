const ALARM_NAME = "streambell-check";

async function getSettings() {
  const { settings } = await chrome.storage.local.get("settings");
  return { interval: 5, ...(settings || {}) };
}

async function updateAlarm() {
  const settings = await getSettings();
  chrome.alarms.create(ALARM_NAME, { periodInMinutes: settings.interval });
}

chrome.runtime.onInstalled.addListener(updateAlarm);

(async () => {
  const { channels = [] } = await chrome.storage.local.get("channels");
  if (channels.some((c) => c.checkingSince)) {
    channels.forEach((c) => (c.checkingSince = null));
    await chrome.storage.local.set({ channels });
  }
})();

self.addEventListener("online", () => {
  setTimeout(() => checkAllChannels().catch(() => {}), 5000);
});
chrome.runtime.onStartup.addListener(updateAlarm);

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === ALARM_NAME) {
    checkAllChannels();
    return;
  }
  if (alarm.name.startsWith("recheck|")) {
    const [, platform, handle] = alarm.name.split("|");
    const { channels = [] } = await chrome.storage.local.get("channels");
    const ch = channels.find((c) => c.handle === handle && (c.platform || "youtube") === platform);
    if (ch && !ch.paused) checkChannel(ch).catch(() => {});
  }
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "CHECK_NOW") {
    checkAllChannels(true)
      .catch((e) => console.error("Canais: CHECK_NOW falhou", e))
      .finally(() => sendResponse({ done: true }));
    return true;
  }
  if (msg?.type === "RESET") {
    resetExtension()
      .catch((e) => console.error("Canais: reset falhou", e))
      .finally(() => sendResponse({ done: true }));
    return true;
  }
  if (msg?.type === "UPDATE_ALARM") {
    updateAlarm().finally(() => sendResponse({ done: true }));
    return true;
  }
  if (msg?.type === "CHECK_ONE") {
    (async () => {
      try {
        const { channels = [] } = await chrome.storage.local.get("channels");
        const ch = channels.find(
          (c) => c.handle === msg.handle && (c.platform || "youtube") === (msg.platform || "youtube")
        );
        if (ch) {
          await checkChannel(ch, true);
          await updateBadge();
        }
      } catch (e) {
        console.error("Canais: CHECK_ONE falhou", e);
      }
      sendResponse({ done: true });
    })();
    return true;
  }
});

async function updateBadge() {
  const { channels = [] } = await chrome.storage.local.get("channels");
  const liveCount = channels.filter((c) => c.isLive && !c.paused).length;
  await chrome.action.setBadgeText({ text: liveCount > 0 ? String(liveCount) : "" });
  await chrome.action.setBadgeBackgroundColor({ color: "#8b5cf6" });
}

const FETCH_TIMEOUT_MS = 10000;
const WATCHDOG_MS = 20000;

function watchdogError() {
  const e = new Error(`verificação passou de ${WATCHDOG_MS / 1000}s`);
  e.isWatchdog = true;
  return e;
}

async function fetchOnce(url, options = {}) {
  const host = new URL(url).hostname.replace(/^www\./, "");
  const { signal: watchdog, ...rest } = options;
  if (watchdog?.aborted) throw watchdogError();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  const onWatchdog = () => controller.abort();
  watchdog?.addEventListener("abort", onWatchdog);
  try {
    const res = await fetch(url, { ...rest, signal: controller.signal });
    const body = await res.text();
    return { ok: res.ok, status: res.status, body };
  } catch (err) {
    if (watchdog?.aborted) throw watchdogError();
    const e = new Error(
      err?.name === "AbortError"
        ? `${host} não respondeu em ${FETCH_TIMEOUT_MS / 1000}s`
        : `sem resposta de ${host} (${err?.message || err})`
    );
    e.isNetworkError = true;
    throw e;
  } finally {
    clearTimeout(timer);
    watchdog?.removeEventListener("abort", onWatchdog);
  }
}

async function safeFetch(url, options) {
  try {
    return await fetchOnce(url, options);
  } catch (err) {
    if (!err.isNetworkError || err.isWatchdog) throw err;
    await new Promise((r) => setTimeout(r, 2000));
    if (options?.signal?.aborted) throw watchdogError();
    return fetchOnce(url, options);
  }
}

async function fetchText(url, options) {
  const res = await safeFetch(url, options);
  if (!res.ok) {
    const e = new Error(`HTTP ${res.status} em ${new URL(url).hostname}`);
    e.status = res.status;
    throw e;
  }
  return res.body;
}

function startKeepAlive() {
  const id = setInterval(() => chrome.runtime.getPlatformInfo(() => {}), 20000);
  return () => clearInterval(id);
}

async function fetchYoutubeChannelInfo(handle, signal) {
  const cleanHandle = handle.startsWith("@") ? handle : `@${handle}`;
  const html = await fetchText(`https://www.youtube.com/${cleanHandle}`, { signal });

  const idMatch =
    html.match(/<link rel="canonical" href="https:\/\/www\.youtube\.com\/channel\/(UC[\w-]{22})"/) ||
    html.match(/"externalId"\s*:\s*"(UC[\w-]{22})"/) ||
    html.match(/<meta itemprop="identifier" content="(UC[\w-]{22})"/) ||
    html.match(/"channelId"\s*:\s*"(UC[\w-]{22})"/);

  const avatarMatch =
    html.match(/<meta property="og:image" content="([^"]+)"/) ||
    html.match(/"avatar"\s*:\s*\{\s*"thumbnails"\s*:\s*\[\s*\{\s*"url"\s*:\s*"([^"]+)"/);

  return {
    channelId: idMatch ? idMatch[1] : null,
    avatarUrl: avatarMatch ? avatarMatch[1].replace(/&amp;/g, "&") : null,
  };
}

function decodeXml(s) {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

async function fetchLatestVideoFromRss(channelId, signal) {
  const xml = await fetchText(`https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`, { signal });
  const entryMatch = xml.match(/<entry>[\s\S]*?<\/entry>/);
  if (!entryMatch) return null;

  const entry = entryMatch[0];
  const idMatch = entry.match(/<yt:videoId>([^<]+)<\/yt:videoId>/);
  const titleMatch = entry.match(/<title>([^<]*)<\/title>/);
  if (!idMatch) return null;

  return {
    videoId: idMatch[1],
    url: `https://www.youtube.com/watch?v=${idMatch[1]}`,
    title: titleMatch ? decodeXml(titleMatch[1]) : "",
  };
}

async function fetchLatestVideoFromPage(channelId, signal) {
  const html = await fetchText(`https://www.youtube.com/channel/${channelId}/videos`, { signal });
  const idMatch = html.match(/"videoId"\s*:\s*"([\w-]{11})"/);
  if (!idMatch) return null;
  return {
    videoId: idMatch[1],
    url: `https://www.youtube.com/watch?v=${idMatch[1]}`,
    title: "",
  };
}

async function fetchLatestVideo(channelId, signal) {
  try {
    const v = await fetchLatestVideoFromRss(channelId, signal);
    if (v) return v;
  } catch (err) {
    if (err.isWatchdog) throw err;
    console.warn("Canais: feed RSS falhou, usando página de vídeos", err.message);
  }
  return fetchLatestVideoFromPage(channelId, signal);
}

async function checkNewVideo(channelConfig, gen, signal) {
  if ((channelConfig.platform || "youtube") !== "youtube") return;
  if (!channelConfig.notifyVideos && !channelConfig.autoOpenVideos) return;

  try {
    let channelId = channelConfig.channelId;
    if (!channelId) {
      const info = await fetchYoutubeChannelInfo(channelConfig.handle, signal);
      channelId = info.channelId;
      if (!channelId) throw new Error("não achei o ID do canal na página");
    }

    const latest = await fetchLatestVideo(channelId, signal);

    const { channels = [] } = await chrome.storage.local.get("channels");
    const idx = channels.findIndex(
      (c) => c.handle === channelConfig.handle && (c.platform || "youtube") === "youtube"
    );
    if (idx === -1) return;

    if (gen !== undefined && gen !== resetGeneration) return;

    channels[idx].channelId = channelId;
    channels[idx].videoError = null;

    if (latest) {
      const isFirstRun = !channels[idx].lastVideoId;
      const isNew = !isFirstRun && channels[idx].lastVideoId !== latest.videoId;

      channels[idx].lastVideoId = latest.videoId;
      channels[idx].lastVideoUrl = latest.url;
      if (latest.title) channels[idx].lastVideoTitle = latest.title;

      await chrome.storage.local.set({ channels });

      const isTheCurrentLive = channels[idx].isLive && channels[idx].liveVideoId === latest.videoId;
      if (isNew && !isTheCurrentLive) {
        await onNewVideo(channels[idx], latest.title);
      }
    } else {
      await chrome.storage.local.set({ channels });
    }
  } catch (err) {
    if (err.isWatchdog) throw err;
    console.warn(`Canais: erro ao checar vídeos de ${channelConfig.handle}`, err.message);
    await patchChannel(channelConfig, { videoError: String(err.message || err).slice(0, 160) }, gen);
  }
}

async function onNewVideo(channel, title) {
  if (channel.notifyVideos) {
    const notifId = `streambell-${crypto.randomUUID()}`;
    const { notifMap = {} } = await chrome.storage.local.get("notifMap");
    notifMap[notifId] = { url: channel.lastVideoUrl };
    await chrome.storage.local.set({ notifMap });

    chrome.notifications.create(notifId, {
      type: "basic",
      iconUrl: "icons/icon128.png",
      title: "Canais",
      message: `Novo vídeo de ${channel.handle}${title ? ": " + title : ""}`,
      priority: 1,
    });
    await playNotificationSound();
  }
  if (channel.autoOpenVideos && channel.lastVideoUrl) {
    await openTab(channel.lastVideoUrl);
  }
}

async function patchChannel(channelConfig, fields, gen) {
  if (gen !== undefined && gen !== resetGeneration) return;
  const { channels = [] } = await chrome.storage.local.get("channels");
  const idx = channels.findIndex(
    (c) =>
      c.handle === channelConfig.handle &&
      (c.platform || "youtube") === (channelConfig.platform || "youtube")
  );
  if (idx === -1) return;
  Object.assign(channels[idx], fields);
  await chrome.storage.local.set({ channels });
}

const inProgress = new Map();

let resetGeneration = 0;

async function checkChannel(channelConfig, isManualCheck = false, { silent = false } = {}) {
  const platform = channelConfig.platform || "youtube";
  const key = platform + ":" + channelConfig.handle;
  const gen = resetGeneration;
  if (inProgress.get(key) === gen) return;
  inProgress.set(key, gen);
  const stopKeepAlive = startKeepAlive();
  await patchChannel(channelConfig, { checkingSince: Date.now() }, gen);
  try {

    let stuck = null;
    for (let attempt = 1; attempt <= 2; attempt++) {
      if (gen !== resetGeneration) break;
      const wd = new AbortController();
      const timer = setTimeout(() => wd.abort(), WATCHDOG_MS);
      try {
        await doCheckChannel(channelConfig, isManualCheck, platform, gen, silent, wd.signal);
        stuck = null;
        break;
      } catch (err) {
        if (!err.isWatchdog) throw err;
        stuck = err;
        console.warn(`Canais: verificação de ${channelConfig.handle} travou (tentativa ${attempt}), refazendo`);
      } finally {
        clearTimeout(timer);
      }
    }
    if (stuck) {
      await patchChannel(
        channelConfig,
        {
          lastError: `travou 2x (mais de ${WATCHDOG_MS / 1000}s cada) — tenta de novo no próximo ciclo`,
          lastChecked: Date.now(),
        },
        gen
      );
    }
  } finally {
    if (inProgress.get(key) === gen) inProgress.delete(key);
    stopKeepAlive();
    await patchChannel(channelConfig, { checkingSince: null }, gen);
  }
}

async function doCheckChannel(channelConfig, isManualCheck, platform, gen, silent, signal) {
  try {
    let isLive = false;
    let liveUrl = "";
    let liveVideoId = null;
    let detectedAvatarUrl = null;

    if (platform === "twitch") {
      const cleanHandle = channelConfig.handle.replace("@", "").trim().toLowerCase();
      liveUrl = `https://www.twitch.tv/${cleanHandle}`;
      const html = await fetchText(liveUrl, { redirect: "follow", signal });

      isLive = /"isLiveBroadcast"\s*:\s*true/.test(html);

      const avatarMatch = html.match(
        /https:\/\/static-cdn\.jtvnw\.net\/jtv_user_pictures\/[a-zA-Z0-9\-_/.]+\.(?:png|jpe?g)/
      );
      if (avatarMatch) detectedAvatarUrl = avatarMatch[0];
    } else if (platform === "kick") {
      const cleanHandle = channelConfig.handle.replace("@", "").trim().toLowerCase();
      liveUrl = `https://kick.com/${cleanHandle}`;

      const apiRes = await safeFetch(`https://kick.com/api/v1/channels/${cleanHandle}`, {
        headers: { Accept: "application/json" },
        signal,
      });
      if (!apiRes.ok) {
        throw new Error(`Kick respondeu ${apiRes.status} (pode ser bloqueio da Cloudflare)`);
      }
      const data = JSON.parse(apiRes.body);

      isLive = !!(data && data.livestream);
      const apiAvatar = data?.user?.profile_pic || data?.profile_picture || null;
      if (apiAvatar) detectedAvatarUrl = apiAvatar;
    } else {
      const cleanHandle = channelConfig.handle.startsWith("@") ? channelConfig.handle : `@${channelConfig.handle}`;
      liveUrl = `https://www.youtube.com/${cleanHandle}/live`;
      const html = await fetchText(liveUrl, { redirect: "follow", signal });

      isLive = /"isLive"\s*:\s*true/.test(html) || /"isLiveBroadcast"\s*:\s*true/.test(html);
      if (isLive) {
        const vid = html.match(/<link rel="canonical" href="https:\/\/www\.youtube\.com\/watch\?v=([\w-]{11})"/);
        if (vid) liveVideoId = vid[1];
      }
    }

    const { channels = [] } = await chrome.storage.local.get("channels");
    const idx = channels.findIndex(
      (c) => c.handle === channelConfig.handle && (c.platform || "youtube") === platform
    );
    if (idx === -1) return;

    const ch = channels[idx];
    const wasLive = !!ch.isLive;
    ch.lastChecked = Date.now();
    ch.lastError = null;

    let pendingEnd = false;
    if (isLive) {
      ch.offlineStreak = 0;
      ch.isLive = true;
      ch.liveUrl = liveUrl;
      if (liveVideoId) ch.liveVideoId = liveVideoId;
      if (!wasLive) ch.liveSince = Date.now();
    } else if (wasLive && (ch.offlineStreak || 0) < 1) {
      ch.offlineStreak = 1;
      pendingEnd = true;
    } else {
      ch.offlineStreak = 0;
      ch.isLive = false;
      ch.liveSince = null;
      ch.liveVideoId = null;
    }

    if (platform !== "youtube" && !channels[idx].avatarUrl && detectedAvatarUrl) {

      channels[idx].avatarUrl = detectedAvatarUrl;
    }

    if (gen !== resetGeneration) return;

    await chrome.storage.local.set({ channels });

    if (pendingEnd) scheduleRecheck(ch);

    if (!silent && isLive) {
      if (!wasLive) await onChannelWentLive(ch, { allowAutoOpen: true });
      else if (isManualCheck) await onChannelWentLive(ch, { allowAutoOpen: false });
    }

    if (platform === "youtube" && (!channels[idx].avatarUrl || !channels[idx].channelId)) {
      try {
        const info = await fetchYoutubeChannelInfo(channelConfig.handle, signal);
        const fields = {};
        if (info.avatarUrl && !channels[idx].avatarUrl) fields.avatarUrl = info.avatarUrl;
        if (info.channelId && !channels[idx].channelId) fields.channelId = info.channelId;
        if (Object.keys(fields).length) await patchChannel(channelConfig, fields, gen);
      } catch (avatarErr) {
        if (avatarErr.isWatchdog) throw avatarErr;
        console.warn(`Canais: erro ao buscar foto de ${channelConfig.handle}`, avatarErr.message);
      }
    }

    const { channels: fresh = [] } = await chrome.storage.local.get("channels");
    const current = fresh.find(
      (c) => c.handle === channelConfig.handle && (c.platform || "youtube") === platform
    );
    if (current) await checkNewVideo(current, gen, signal);
  } catch (err) {
    if (err?.isWatchdog) throw err;
    const message = String(err?.message || err).slice(0, 160);
    await patchChannel(channelConfig, { lastError: message, lastChecked: Date.now() }, gen);
    if (err?.isNetworkError) {
      console.warn(`Canais: falha de rede ao checar ${channelConfig.handle}:`, message);
    } else {
      console.error(`Canais: erro ao checar ${channelConfig.handle}`, err);
    }
  }
}

async function checkAllChannels(isManualCheck = false, opts = {}) {
  const gen = resetGeneration;
  const { channels = [] } = await chrome.storage.local.get("channels");

  for (const c of channels) {
    if (gen !== resetGeneration) return;
    if (!c.paused) {
      await checkChannel(c, isManualCheck, opts);
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
  }

  await updateBadge();
}

async function resetExtension() {
  resetGeneration++;
  inProgress.clear();

  const { channels = [] } = await chrome.storage.local.get("channels");
  const cleaned = channels.map((c) => ({
    platform: c.platform || "youtube",
    handle: c.handle,
    notify: !!c.notify,
    autoOpen: !!c.autoOpen,
    paused: !!c.paused,
    notifyVideos: !!c.notifyVideos,
    autoOpenVideos: !!c.autoOpenVideos,
    isLive: false,
    lastChecked: null,
    liveUrl: null,
    liveSince: null,
    liveVideoId: null,
    channelId: null,
    lastVideoId: null,
    lastVideoUrl: null,
    lastVideoTitle: null,
    avatarUrl: null,
    lastError: null,
    videoError: null,
    checkingSince: null,
    offlineStreak: 0,
    lastAutoOpenAt: null,
    lastAutoOpenKey: null,
  }));
  await chrome.storage.local.set({ channels: cleaned, notifMap: {} });

  await chrome.action.setBadgeText({ text: "" });
  try {
    if (await chrome.offscreen.hasDocument()) await chrome.offscreen.closeDocument();
  } catch (_) {}
  await chrome.alarms.clearAll();
  await updateAlarm();

  checkAllChannels(false, { silent: true }).catch((e) => console.error("Canais: pós-reset", e));
}

async function openTab(url) {
  try {
    await chrome.tabs.create({ url });
  } catch (err) {
    try {
      await chrome.windows.create({ url, focused: true });
    } catch (err2) {
      console.warn("Canais: não consegui abrir a aba", err2?.message || err2);
    }
  }
}

async function ensureOffscreenDocument() {
  const has = await chrome.offscreen.hasDocument();
  if (has) return;
  await chrome.offscreen.createDocument({
    url: "offscreen.html",
    reasons: ["AUDIO_PLAYBACK"],
    justification: "Tocar o som de notificação quando um canal fica ao vivo ou publica vídeo novo",
  });
}

async function playNotificationSound() {
  try {
    await ensureOffscreenDocument();
    chrome.runtime.sendMessage({ type: "PLAY_SOUND" }).catch(() => {});
  } catch (err) {
    console.error("Canais: erro ao tocar som de notificação", err);
  }
}

function scheduleRecheck(channel) {
  const name = `recheck|${channel.platform || "youtube"}|${channel.handle}`;
  chrome.alarms.create(name, { delayInMinutes: 1 });
}

async function isChannelTabOpen(channel) {
  const platform = channel.platform || "youtube";
  const h = channel.handle.replace("@", "").trim().toLowerCase();
  const patterns = [];
  if (platform === "youtube") {
    patterns.push(`*://www.youtube.com/@${channel.handle.replace("@", "")}/live*`);
    if (channel.liveVideoId) patterns.push(`*://www.youtube.com/watch?v=${channel.liveVideoId}*`);
  } else if (platform === "twitch") {
    patterns.push(`*://www.twitch.tv/${h}*`);
  } else {
    patterns.push(`*://kick.com/${h}*`);
  }
  try {
    const tabs = await chrome.tabs.query({ url: patterns });
    return tabs.length > 0;
  } catch (_) {
    return false;
  }
}

const AUTO_OPEN_COOLDOWN_MS = 15 * 60 * 1000;

async function shouldAutoOpen(channel) {
  if (!channel.autoOpen || !channel.liveUrl) return false;

  if (channel.liveVideoId && channel.lastAutoOpenKey === channel.liveVideoId) return false;

  if (!channel.liveVideoId && channel.lastAutoOpenAt && Date.now() - channel.lastAutoOpenAt < AUTO_OPEN_COOLDOWN_MS)
    return false;

  if (await isChannelTabOpen(channel)) return false;
  return true;
}

async function onChannelWentLive(channel, { allowAutoOpen = true } = {}) {
  const platformLabel =
    channel.platform === "twitch" ? "Twitch" : channel.platform === "kick" ? "Kick" : "YouTube";

  if (channel.notify) {
    const notifId = `streambell-${crypto.randomUUID()}`;

    const { notifMap = {} } = await chrome.storage.local.get("notifMap");
    notifMap[notifId] = { url: channel.liveUrl };
    await chrome.storage.local.set({ notifMap });

    chrome.notifications.create(notifId, {
      type: "basic",
      iconUrl: "icons/icon128.png",
      title: "Canais",
      message: `${channel.handle} está ao vivo na ${platformLabel}!`,
      priority: 2,
    });
    await playNotificationSound();
  }
  if (allowAutoOpen && (await shouldAutoOpen(channel))) {
    await patchChannel(channel, {
      lastAutoOpenAt: Date.now(),
      lastAutoOpenKey: channel.liveVideoId || channel.liveUrl,
    });
    await openTab(channel.liveUrl);
  }
}

chrome.notifications.onClicked.addListener(async (notifId) => {
  if (!notifId.startsWith("streambell-")) return;

  const { notifMap = {} } = await chrome.storage.local.get("notifMap");
  const entry = notifMap[notifId];
  if (entry?.url) await openTab(entry.url);

  delete notifMap[notifId];
  await chrome.storage.local.set({ notifMap });
});

chrome.notifications.onClosed.addListener(async (notifId) => {
  if (!notifId.startsWith("streambell-")) return;
  const { notifMap = {} } = await chrome.storage.local.get("notifMap");
  if (notifMap[notifId]) {
    delete notifMap[notifId];
    await chrome.storage.local.set({ notifMap });
  }
});
