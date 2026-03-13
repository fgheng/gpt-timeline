/**
 * Popup — 站点开关管理
 *
 * 默认值：DeepSeek 关闭，其他全开。
 * 存储在 chrome.storage.sync 中。
 */

const DEFAULTS = {
  "chatgpt.com": true,
  "chat.deepseek.com": false,   // DeepSeek 自带时间线，默认关闭
  "chat.qwen.ai": true,
  "www.doubao.com": true,
  "www.kimi.com": true,
};

// 加载设置
chrome.storage.sync.get("siteToggles", (result) => {
  const toggles = Object.assign({}, DEFAULTS, result.siteToggles || {});

  document.querySelectorAll("input[data-site]").forEach((input) => {
    const site = input.getAttribute("data-site");
    input.checked = !!toggles[site];

    input.addEventListener("change", () => {
      toggles[site] = input.checked;
      chrome.storage.sync.set({ siteToggles: toggles });

      // 通知当前匹配的 tab 刷新状态
      chrome.tabs.query({ url: `https://${site}/*` }, (tabs) => {
        tabs.forEach((tab) => {
          chrome.tabs.sendMessage(tab.id, {
            type: "toggle",
            site,
            enabled: input.checked,
          }).catch(() => {});
        });
      });
    });
  });
});
