/**
 * GPT Timeline — 星光时间线（多平台版）
 *
 * 支持：ChatGPT / DeepSeek / 通义千问(Qwen) / 豆包(Doubao) / Kimi
 * 
 * 定位策略：不依赖容器选择器，而是直接测量用户消息元素的位置，
 * 取所有消息的最大 right 值作为对话区域右边界，时间线贴在它旁边。
 */

(() => {
  "use strict";

  /* ================================================================
   *  平台适配器 — 只负责找用户消息元素
   * ================================================================ */

  const ADAPTERS = {

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

    deepseek: {
      match: () => location.hostname === "chat.deepseek.com",
      getUserMessages() {
        // DeepSeek: 用户消息在 .fa81 或带 data-role 的元素中
        const selectors = [
          '[data-role="user"]',
          '.ds-message-user',
          'div[class*="human"]',
          'div[class*="User"]',
        ];
        for (const sel of selectors) {
          const msgs = Array.from(document.querySelectorAll(sel));
          if (msgs.length > 0) return msgs;
        }
        // 兜底：找所有对话 bubble，取奇数位（用户在上、AI在下的交替模式）
        return this._alternating();
      },
      _alternating() {
        const all = document.querySelectorAll('div[class*="message"] div[class*="markdown"], div[class*="msg-"] div[class*="content"]');
        return Array.from(all).filter((_, i) => i % 2 === 0);
      },
    },

    qwen: {
      match: () => location.hostname === "chat.qwen.ai",
      getUserMessages() {
        const selectors = [
          '[data-role="user"]',
          '[data-message-role="user"]',
          'div[class*="user-message"]',
          'div[class*="UserMessage"]',
          'div[class*="human"]',
        ];
        for (const sel of selectors) {
          const msgs = Array.from(document.querySelectorAll(sel));
          if (msgs.length > 0) return msgs;
        }
        // 兜底：右对齐的消息
        const allBlocks = document.querySelectorAll('div[class*="message"]');
        return Array.from(allBlocks).filter(el => {
          const rect = el.getBoundingClientRect();
          return rect.left > window.innerWidth * 0.4; // 偏右的是用户消息
        });
      },
    },

    doubao: {
      match: () => location.hostname === "www.doubao.com",
      getUserMessages() {
        const selectors = [
          '[data-role="user"]',
          '[data-testid*="user"]',
          'div[class*="user-message"]',
          'div[class*="human-message"]',
          'div[class*="UserMessage"]',
          'div[class*="chat-message--user"]',
        ];
        for (const sel of selectors) {
          const msgs = Array.from(document.querySelectorAll(sel));
          if (msgs.length > 0) return msgs;
        }
        // 兜底
        const all = document.querySelectorAll('div[class*="message-content"], div[class*="chat-message"]');
        return Array.from(all).filter((_, i) => i % 2 === 0);
      },
    },

    kimi: {
      match: () => location.hostname === "www.kimi.com",
      getUserMessages() {
        const selectors = [
          '[data-role="user"]',
          '[data-author="user"]',
          'div[class*="user-message"]',
          'div[class*="UserMessage"]',
          'div[class*="human"]',
        ];
        for (const sel of selectors) {
          const msgs = Array.from(document.querySelectorAll(sel));
          if (msgs.length > 0) return msgs;
        }
        // 兜底
        const all = document.querySelectorAll('div[class*="message"]');
        return Array.from(all).filter((_, i) => i % 2 === 0);
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
        '[data-testid*="user"]',
        'div[class*="user-msg"]',
        'div[class*="user-message"]',
        'div[class*="UserMessage"]',
        'div[class*="human-message"]',
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
  let lastCount   = 0;
  let lastHash    = "";   // 用于检测消息内容变化
  let hoverTimer  = null;

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

  function updatePosition() {
    if (!timeline) return;

    const msgs = getUserMessages();
    let rightEdge = 0;

    if (msgs.length > 0) {
      // 取所有用户消息中最大的 right 值，作为对话区域的右边界
      // 同时也检查 AI 回复（紧跟在用户消息后面的兄弟元素）
      for (const msg of msgs) {
        const rect = msg.getBoundingClientRect();
        if (rect.right > rightEdge) rightEdge = rect.right;

        // 也检查消息的父容器（有些平台消息元素本身很窄，容器更宽）
        let parent = msg.parentElement;
        for (let i = 0; i < 3 && parent; i++) {
          const pRect = parent.getBoundingClientRect();
          // 只取合理宽度的容器（不要取 body 那么宽的）
          if (pRect.width < window.innerWidth * 0.85 && pRect.right > rightEdge) {
            rightEdge = pRect.right;
          }
          parent = parent.parentElement;
        }
      }
    }

    // 如果没有消息或检测失败，使用估算值
    if (rightEdge === 0) {
      // 大多数 AI 聊天页面对话区域居中，宽度约 48-52rem
      rightEdge = window.innerWidth / 2 + 380;
    }

    // 确保时间线不会太靠右（超出屏幕）也不会太靠左（进入对话区）
    const timelineLeft = Math.min(
      window.innerWidth - 50,        // 不超出屏幕
      Math.max(rightEdge + 16, window.innerWidth / 2 + 100)  // 至少在中线右侧
    );

    timeline.style.right = "auto";
    timeline.style.left = timelineLeft + "px";
    toggleBtn.style.right = "auto";
    toggleBtn.style.left = (timelineLeft + 4) + "px";
  }

  /* ---------- 文本提取 ---------- */

  function extractText(el) {
    const text = (el.innerText || el.textContent || "").trim().replace(/\n{3,}/g, "\n\n");
    if (text.length <= MAX_TEXT_LEN) return text;
    return text.slice(0, MAX_TEXT_LEN) + "…";
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
        el.scrollIntoView({ behavior: SCROLL_BEHAVIOR, block: "center" });
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

    // 用数量+首尾文本做简单 hash，检测变化
    const hash = msgs.length + "|" +
      (msgs[0]?.textContent?.slice(0, 20) || "") + "|" +
      (msgs[msgs.length - 1]?.textContent?.slice(0, 20) || "");

    if (hash !== lastHash) {
      lastHash = hash;
      lastCount = msgs.length;
      render(msgs);
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

  /* ---------- URL 变化检测 ---------- */

  function setupRouteListener() {
    let lastUrl = location.href;
    const check = () => {
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        lastHash = "";
        lastCount = 0;
        activeIndex = -1;
        currentAdapter = detectAdapter();
        setTimeout(tick, 500);
      }
    };
    window.addEventListener("popstate", check);
    setInterval(check, 1000);
  }

  /* ---------- 入口 ---------- */

  function init() {
    currentAdapter = detectAdapter();
    createTooltip();
    createTimeline();
    setupTooltipHover();
    tick();
    setInterval(tick, SCAN_INTERVAL);
    setupScrollListener();
    setupResizeListener();
    setupObserver();
    setupRouteListener();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
