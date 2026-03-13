/**
 * GPT Timeline — 星光时间线（多平台版）
 *
 * 支持：ChatGPT / DeepSeek / 通义千问(Qwen) / 豆包(Doubao) / Kimi
 * 每个平台的选择器都经过实际 DOM 验证。
 *
 * 定位策略：不依赖容器选择器，直接测量消息元素位置来放置时间线。
 */

(() => {
  "use strict";

  /* ================================================================
   *  站点开关 — 检查当前站点是否启用
   * ================================================================ */

  const SITE_DEFAULTS = {
    "chatgpt.com": true,
    "chat.deepseek.com": false,   // DeepSeek 自带时间线，默认关闭
    "chat.qwen.ai": true,
    "www.doubao.com": true,
    "www.kimi.com": true,
  };

  let siteEnabled = SITE_DEFAULTS[location.hostname];
  if (siteEnabled === undefined) siteEnabled = true; // 未知站点默认开启

  // 从 storage 读取用户设置
  if (chrome.storage && chrome.storage.sync) {
    chrome.storage.sync.get("siteToggles", (result) => {
      const toggles = result.siteToggles || {};
      if (location.hostname in toggles) {
        siteEnabled = toggles[location.hostname];
      }
      if (siteEnabled) {
        init();
      } else {
        destroy();
      }
    });
  } else {
    // storage 不可用，用默认值
    if (siteEnabled) init();
  }

  // 监听来自 popup 的实时开关消息
  if (chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((msg) => {
      if (msg.type === "toggle" && msg.site === location.hostname) {
        siteEnabled = msg.enabled;
        if (siteEnabled) {
          init();
        } else {
          destroy();
        }
      }
    });
  }

  /* ================================================================
   *  销毁/重建
   * ================================================================ */

  let intervalId = null;
  let routeIntervalId = null;
  let initialized = false;

  function destroy() {
    const tl = document.getElementById("gpt-timeline");
    if (tl) tl.remove();
    const btn = document.getElementById("gpt-timeline-toggle");
    if (btn) btn.remove();
    const tip = document.getElementById("gpt-tl-tooltip");
    if (tip) tip.remove();
    timeline = null;
    toggleBtn = null;
    nodesWrap = null;
    tooltip = null;
    if (intervalId) { clearInterval(intervalId); intervalId = null; }
    if (routeIntervalId) { clearInterval(routeIntervalId); routeIntervalId = null; }
    initialized = false;
  }

  /* ================================================================
   *  平台适配器 — 经过实际 DOM 结构验证
   * ================================================================ */

  const ADAPTERS = {

    /* ---- ChatGPT (chatgpt.com) ---- */
    chatgpt: {
      match: () => location.hostname === "chatgpt.com",
      getUserMessages() {
        let msgs = Array.from(
          document.querySelectorAll('[data-message-author-role="user"]')
        );
        if (msgs.length === 0) {
          const turns = document.querySelectorAll('[data-testid^="conversation-turn-"]');
          turns.forEach((turn, i) => {
            if (i % 2 === 0) {
              const text = turn.querySelector('.whitespace-pre-wrap');
              if (text) msgs.push(text);
            }
          });
        }
        return msgs;
      },
    },

    /* ---- DeepSeek (chat.deepseek.com) ----
     *  所有消息都有 class "ds-message"
     *  用户消息的父级 align-items: flex-end
     */
    deepseek: {
      match: () => location.hostname === "chat.deepseek.com",
      getUserMessages() {
        const allMsgs = document.querySelectorAll('.ds-message');
        return Array.from(allMsgs).filter(el => {
          const parent = el.parentElement;
          if (!parent) return false;
          const style = window.getComputedStyle(parent);
          return style.alignItems === 'flex-end';
        });
      },
    },

    /* ---- 通义千问 Qwen (chat.qwen.ai) ----
     *  用户消息: .qwen-chat-message-user
     *  AI 回复:  .qwen-chat-message-assistant
     */
    qwen: {
      match: () => location.hostname === "chat.qwen.ai",
      getUserMessages() {
        let msgs = Array.from(
          document.querySelectorAll('.qwen-chat-message-user')
        );
        if (msgs.length > 0) return msgs;

        msgs = Array.from(document.querySelectorAll('.chat-user-message-container'));
        if (msgs.length > 0) return msgs;

        return Array.from(document.querySelectorAll('.chat-user-message'));
      },
    },

    /* ---- 豆包 Doubao (www.doubao.com) ----
     *  用户消息: [data-testid="send_message"]
     *  AI 回复:  [data-testid="receive_message"]
     */
    doubao: {
      match: () => location.hostname === "www.doubao.com",
      getUserMessages() {
        return Array.from(
          document.querySelectorAll('[data-testid="send_message"]')
        );
      },
    },

    /* ---- Kimi (www.kimi.com) ----
     *  用户消息: .segment-user 或 .chat-content-item-user
     *  AI 回复:  .segment-assistant 或 .chat-content-item-assistant
     */
    kimi: {
      match: () => location.hostname === "www.kimi.com",
      getUserMessages() {
        let msgs = Array.from(document.querySelectorAll('.segment-user'));
        if (msgs.length > 0) return msgs;
        return Array.from(document.querySelectorAll('.chat-content-item-user'));
      },
    },
  };

  /* 通用兜底 */
  const UNIVERSAL_FALLBACK = {
    getUserMessages() {
      const selectors = [
        '[data-message-author-role="user"]',
        '[data-role="user"]',
        '[data-message-role="user"]',
        '[data-author="user"]',
        '[data-testid="send_message"]',
        '.segment-user',
        '.qwen-chat-message-user',
      ];
      for (const sel of selectors) {
        const msgs = Array.from(document.querySelectorAll(sel));
        if (msgs.length > 0) return msgs;
      }
      return [];
    },
  };

  /* ================================================================
   *  平台检测
   * ================================================================ */

  let currentAdapter = null;

  function detectAdapter() {
    for (const [name, adapter] of Object.entries(ADAPTERS)) {
      if (adapter.match()) {
        console.log(`[GPT Timeline] Detected platform: ${name}`);
        return adapter;
      }
    }
    console.log("[GPT Timeline] Using universal fallback");
    return null;
  }

  function getUserMessages() {
    if (!currentAdapter) currentAdapter = detectAdapter();

    if (currentAdapter) {
      const msgs = currentAdapter.getUserMessages();
      if (msgs.length > 0) return msgs;
    }

    return UNIVERSAL_FALLBACK.getUserMessages();
  }

  /* ================================================================
   *  核心 UI
   * ================================================================ */

  const SCAN_INTERVAL   = 1500;
  const MAX_TEXT_LEN    = 300;
  const SCROLL_BEHAVIOR = "smooth";

  let timeline    = null;
  let toggleBtn   = null;
  let nodesWrap   = null;
  let tooltip     = null;
  let visible     = true;
  let activeIndex = -1;
  let lastHash    = "";
  let hoverTimer  = null;
  let cachedRight = 0;   // 缓存的对话区域右边界

  /* ---------- 主题检测 ---------- */

  function detectLightTheme() {
    // 检查实际背景色亮度
    const testEls = [document.body, document.querySelector('main'), document.documentElement];
    for (const el of testEls) {
      if (!el) continue;
      const bg = window.getComputedStyle(el).backgroundColor;
      const match = bg.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
      if (match) {
        const [, r, g, b] = match.map(Number);
        const luminance = (0.299 * r + 0.587 * g + 0.114 * b);
        if (luminance > 160) return true;   // 亮色背景
        if (luminance < 80)  return false;  // 暗色背景
      }
    }
    // 兜底：检查 prefers-color-scheme
    return window.matchMedia('(prefers-color-scheme: light)').matches;
  }

  function applyThemeClass() {
    const isLight = detectLightTheme();
    const tl = document.getElementById("gpt-timeline");
    const tip = document.getElementById("gpt-tl-tooltip");
    if (tl) tl.classList.toggle("tl-light", isLight);
    if (tip) tip.classList.toggle("tl-light", isLight);
  }

  /* ---------- 全局 Tooltip ---------- */

  function createTooltip() {
    if (document.getElementById("gpt-tl-tooltip")) return;

    tooltip = document.createElement("div");
    tooltip.id = "gpt-tl-tooltip";

    const num = document.createElement("span");
    num.className = "tl-tooltip-num";

    const text = document.createElement("span");
    text.className = "tl-tooltip-text";

    tooltip.appendChild(num);
    tooltip.appendChild(text);
    document.body.appendChild(tooltip);
  }

  function showTooltip(nodeEl, idx, questionText) {
    if (!tooltip) return;

    tooltip.querySelector(".tl-tooltip-num").textContent = `Question #${idx + 1}`;
    tooltip.querySelector(".tl-tooltip-text").textContent = questionText;

    tooltip.classList.remove("visible");
    tooltip.style.left = "-9999px";
    tooltip.style.top  = "0";
    tooltip.style.display = "block";

    const tipRect  = tooltip.getBoundingClientRect();
    const nodeRect = nodeEl.getBoundingClientRect();

    let top  = nodeRect.top + nodeRect.height / 2 - 22;
    let left = nodeRect.right + 10;

    const rightSpace = window.innerWidth - nodeRect.right - 10;
    const tooltipWidth = Math.min(320, Math.max(160, rightSpace - 16));
    tooltip.style.width = tooltipWidth + "px";

    if (rightSpace < 100) {
      left = nodeRect.left - tipRect.width - 10;
      tooltip.style.width = "320px";
      tooltip.classList.add("arrow-right");
      tooltip.classList.remove("arrow-left");
    } else {
      tooltip.classList.add("arrow-left");
      tooltip.classList.remove("arrow-right");
    }

    const margin = 8;
    if (top < margin) top = margin;
    if (top + tipRect.height > window.innerHeight - margin) {
      top = window.innerHeight - margin - tipRect.height;
    }
    if (left + tooltipWidth > window.innerWidth - margin) {
      left = window.innerWidth - margin - tooltipWidth;
    }
    if (left < margin) left = margin;

    tooltip.style.left = left + "px";
    tooltip.style.top  = top + "px";

    requestAnimationFrame(() => {
      tooltip.classList.add("visible");
    });
  }

  function hideTooltip() {
    if (!tooltip) return;
    tooltip.classList.remove("visible");
  }

  /* ---------- DOM 容器 ---------- */

  function createTimeline() {
    if (document.getElementById("gpt-timeline")) return;

    timeline = document.createElement("div");
    timeline.id = "gpt-timeline";

    const track = document.createElement("div");
    track.className = "tl-track";
    timeline.appendChild(track);

    nodesWrap = document.createElement("div");
    nodesWrap.className = "tl-nodes";
    timeline.appendChild(nodesWrap);

    document.body.appendChild(timeline);

    toggleBtn = document.createElement("button");
    toggleBtn.id = "gpt-timeline-toggle";
    toggleBtn.title = "Toggle Timeline";
    toggleBtn.innerHTML = "✦";
    toggleBtn.addEventListener("click", () => {
      visible = !visible;
      timeline.classList.toggle("hidden", !visible);
      toggleBtn.innerHTML = visible ? "✦" : "✧";
      if (!visible) hideTooltip();
    });
    document.body.appendChild(toggleBtn);

    updatePosition();
  }

  /* ---------- 智能定位：基于消息元素实际位置 ---------- */

  function measureChatRightEdge(msgs) {
    let rightEdge = 0;

    for (const msg of msgs) {
      // 检查消息元素本身及其合理父级
      let el = msg;
      for (let i = 0; i < 5 && el; i++) {
        const rect = el.getBoundingClientRect();
        // 跳过不可见、全宽、或侧边栏里的元素
        if (rect.width > 0 && rect.width < window.innerWidth * 0.85 && rect.left > 100) {
          if (rect.right > rightEdge) {
            rightEdge = rect.right;
          }
        }
        el = el.parentElement;
      }
    }

    // 也检查 AI 回复元素（它们通常更宽）
    const assistantSelectors = [
      '[data-message-author-role="assistant"]',        // ChatGPT
      '[data-testid="receive_message"]',               // 豆包
      '.qwen-chat-message-assistant',                  // Qwen
      '.segment-assistant, .chat-content-item-assistant', // Kimi
    ];
    for (const sel of assistantSelectors) {
      const els = document.querySelectorAll(sel);
      for (const el of els) {
        const rect = el.getBoundingClientRect();
        if (rect.width > 0 && rect.width < window.innerWidth * 0.85 && rect.left > 100) {
          if (rect.right > rightEdge) rightEdge = rect.right;
        }
      }
      if (els.length > 0) break; // 找到一组就够了
    }

    // DeepSeek 特殊处理：AI 回复也是 .ds-message
    if (location.hostname === "chat.deepseek.com") {
      const allDs = document.querySelectorAll('.ds-message');
      for (const el of allDs) {
        const rect = el.getBoundingClientRect();
        if (rect.width > 0 && rect.width < window.innerWidth * 0.85 && rect.left > 100) {
          if (rect.right > rightEdge) rightEdge = rect.right;
        }
      }
    }

    return rightEdge;
  }

  function updatePosition() {
    if (!timeline) return;

    const msgs = getUserMessages();
    let rightEdge = 0;

    if (msgs.length > 0) {
      rightEdge = measureChatRightEdge(msgs);
    }

    // 使用缓存，避免无消息时闪烁
    if (rightEdge > 0) {
      cachedRight = rightEdge;
    } else {
      rightEdge = cachedRight;
    }

    // 如果还是 0（首次且无消息），用估算值
    if (rightEdge === 0) {
      rightEdge = window.innerWidth / 2 + 400;
    }

    // 时间线放在右边界 + 16px
    const timelineLeft = rightEdge + 16;

    // 安全边界：至少距离右边 40px
    const maxLeft = window.innerWidth - 40;

    const finalLeft = Math.min(timelineLeft, maxLeft);

    timeline.style.right = "auto";
    timeline.style.left = finalLeft + "px";
    toggleBtn.style.right = "auto";
    toggleBtn.style.left = (finalLeft + 4) + "px";
  }

  /* ---------- 文本提取 ---------- */

  function extractText(el) {
    // 对于某些平台，消息元素包含按钮文字等，只取核心文本
    // 优先找内部的纯文本容器
    const innerSelectors = [
      '.fbb737a4',           // DeepSeek 用户消息文本
      '.chat-user-message',  // Qwen 用户消息文本
      '.user-content',       // Kimi 用户消息文本
      '[data-testid="message_text_content"]', // 豆包消息文本
      '.whitespace-pre-wrap', // ChatGPT
    ];

    for (const sel of innerSelectors) {
      const inner = el.querySelector(sel);
      if (inner) {
        const text = (inner.innerText || inner.textContent || "").trim();
        if (text.length > 0) {
          return text.length <= MAX_TEXT_LEN ? text : text.slice(0, MAX_TEXT_LEN) + "…";
        }
      }
    }

    // Fallback: 直接取元素文本
    const text = (el.innerText || el.textContent || "").trim().replace(/\n{3,}/g, "\n\n");
    // 去掉常见的按钮文字
    const cleaned = text
      .replace(/编辑|复制|分享|重新生成|Regenerate/g, "")
      .trim();
    if (cleaned.length <= MAX_TEXT_LEN) return cleaned;
    return cleaned.slice(0, MAX_TEXT_LEN) + "…";
  }

  /* ---------- 渲染 ---------- */

  let nodeData = [];

  function render(messages) {
    if (!nodesWrap) return;
    nodesWrap.innerHTML = "";
    nodeData = [];

    messages.forEach((el, idx) => {
      const questionText = extractText(el);
      nodeData.push({ el, text: questionText });

      const node = document.createElement("div");
      node.className = "tl-node";
      if (idx === activeIndex) node.classList.add("active");

      const star = document.createElement("div");
      star.className = "tl-star";

      const badge = document.createElement("span");
      badge.className = "tl-badge";
      badge.textContent = idx + 1;

      node.appendChild(star);
      node.appendChild(badge);

      node.addEventListener("mouseenter", () => {
        clearTimeout(hoverTimer);
        showTooltip(node, idx, questionText);
      });

      node.addEventListener("mouseleave", () => {
        hoverTimer = setTimeout(hideTooltip, 120);
      });

      node.addEventListener("click", () => {
        scrollToElement(el);
        setActive(idx);
      });

      nodesWrap.appendChild(node);
    });
  }

  function setActive(idx) {
    activeIndex = idx;
    if (!nodesWrap) return;
    const nodes = nodesWrap.querySelectorAll(".tl-node");
    nodes.forEach((n, i) => n.classList.toggle("active", i === idx));
  }

  /* ---------- 滚动到元素 ---------- */

  function findScrollContainer(el) {
    // 从元素向上找到真正的滚动容器
    let parent = el.parentElement;
    while (parent && parent !== document.body) {
      const style = window.getComputedStyle(parent);
      const overflowY = style.overflowY;
      if ((overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay')
          && parent.scrollHeight > parent.clientHeight) {
        return parent;
      }
      parent = parent.parentElement;
    }
    return null; // 使用默认 scrollIntoView
  }

  function scrollToElement(el) {
    const container = findScrollContainer(el);
    if (container) {
      // 手动计算滚动位置，使元素居中
      const containerRect = container.getBoundingClientRect();
      const elRect = el.getBoundingClientRect();
      const offset = elRect.top - containerRect.top + container.scrollTop;
      const center = offset - container.clientHeight / 2 + elRect.height / 2;
      container.scrollTo({ top: center, behavior: SCROLL_BEHAVIOR });
    } else {
      el.scrollIntoView({ behavior: SCROLL_BEHAVIOR, block: "center" });
    }
  }

  /* ---------- 滚动跟踪 ---------- */

  function updateActiveByScroll(messages) {
    const viewMid = window.innerHeight / 2;
    let closest = -1;
    let closestDist = Infinity;

    messages.forEach((el, idx) => {
      const rect = el.getBoundingClientRect();
      const dist = Math.abs(rect.top + rect.height / 2 - viewMid);
      if (dist < closestDist) {
        closestDist = dist;
        closest = idx;
      }
    });

    if (closest !== -1 && closest !== activeIndex) {
      setActive(closest);
    }
  }

  /* ---------- Tooltip hover ---------- */

  function setupTooltipHover() {
    if (!tooltip) return;
    tooltip.addEventListener("mouseenter", () => {
      clearTimeout(hoverTimer);
    });
    tooltip.addEventListener("mouseleave", () => {
      hoverTimer = setTimeout(hideTooltip, 100);
    });
  }

  /* ---------- 主循环 ---------- */

  function tick() {
    const msgs = getUserMessages();

    const hash = msgs.length + "|" +
      (msgs[0]?.textContent?.slice(0, 20) || "") + "|" +
      (msgs[msgs.length - 1]?.textContent?.slice(0, 20) || "");

    if (hash !== lastHash) {
      lastHash = hash;
      render(msgs);
      applyThemeClass(); // 消息变化时重新检测主题
    }

    if (msgs.length > 0) {
      updateActiveByScroll(msgs);
    }

    updatePosition();
  }

  /* ---------- 监听 ---------- */

  function setupScrollListener() {
    let timer = null;
    const handler = () => {
      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
        const msgs = getUserMessages();
        if (msgs.length) updateActiveByScroll(msgs);
      }, 100);
    };
    window.addEventListener("scroll", handler, true);
  }

  function setupResizeListener() {
    let timer = null;
    window.addEventListener("resize", () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        cachedRight = 0; // 重置缓存，重新测量
        updatePosition();
      }, 150);
    });
  }

  function setupObserver() {
    let timer = null;
    const observer = new MutationObserver(() => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(tick, 300);
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  function setupRouteListener() {
    let lastUrl = location.href;
    const check = () => {
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        lastHash = "";
        activeIndex = -1;
        cachedRight = 0;
        currentAdapter = detectAdapter();
        setTimeout(tick, 500);
      }
    };
    window.addEventListener("popstate", check);
    routeIntervalId = setInterval(check, 1000);
  }

  /* ---------- 入口 ---------- */

  function init() {
    if (initialized) return;
    initialized = true;

    currentAdapter = detectAdapter();
    createTooltip();
    createTimeline();
    applyThemeClass();
    setupTooltipHover();
    tick();
    intervalId = setInterval(tick, SCAN_INTERVAL);
    setupScrollListener();
    setupResizeListener();
    setupObserver();
    setupRouteListener();
  }

  // 不在这里直接 init()，由上方的 storage 回调决定是否启动
})();
