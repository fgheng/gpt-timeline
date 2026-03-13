/**
 * GPT Timeline — 星光时间线（多平台版）
 *
 * 支持：ChatGPT / DeepSeek / 通义千问(Qwen) / 豆包(Doubao) / Kimi
 * 每个平台有独立的选择器适配，自动检测当前网站。
 */

(() => {
  "use strict";

  /* ================================================================
   *  平台适配器
   *  每个适配器提供:
   *    - getUserMessages()  → 返回用户消息 DOM 元素数组
   *    - getChatContainer() → 返回对话区域容器（用于定位）
   * ================================================================ */

  const ADAPTERS = {

    /* ---- ChatGPT (chatgpt.com) ---- */
    chatgpt: {
      match: () => location.hostname === "chatgpt.com",

      getUserMessages() {
        // 主选择器: data-message-author-role
        let msgs = Array.from(
          document.querySelectorAll('[data-message-author-role="user"]')
        );
        // 兜底
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

      getChatContainer() {
        return (
          document.querySelector('main .xl\\:max-w-\\[48rem\\]') ||
          document.querySelector('main [class*="max-w-"]') ||
          document.querySelector('main .flex.flex-col.items-center') ||
          document.querySelector('main article')?.parentElement?.parentElement
        );
      },
    },

    /* ---- DeepSeek (chat.deepseek.com) ---- */
    deepseek: {
      match: () => location.hostname === "chat.deepseek.com",

      getUserMessages() {
        // DeepSeek 用 .fbb737a4 作为用户消息容器，或 data-role="user"
        let msgs = Array.from(
          document.querySelectorAll('[data-role="user"]')
        );
        if (msgs.length === 0) {
          // 通过消息对的结构：用户消息通常在 .dad65929（对话对）的第一个子块
          msgs = Array.from(
            document.querySelectorAll('.ds-message-user, div[class*="human"], div[class*="User"]')
          );
        }
        if (msgs.length === 0) {
          // 终极兜底：按对话交替模式，偶数位（0-indexed）是用户
          const allMsgs = document.querySelectorAll('div[class*="message"] > div[class*="markdown"], div[class*="msg-content"]');
          msgs = Array.from(allMsgs).filter((_, i) => i % 2 === 0);
        }
        return msgs;
      },

      getChatContainer() {
        return (
          document.querySelector('div[class*="chat-message-list"]') ||
          document.querySelector('div[class*="conversation"]') ||
          document.querySelector('#chat-container') ||
          document.querySelector('main')
        );
      },
    },

    /* ---- 通义千问 Qwen (chat.qwen.ai) ---- */
    qwen: {
      match: () => location.hostname === "chat.qwen.ai",

      getUserMessages() {
        // Qwen 使用 data-role="user" 或 class 中含 "user" 的消息块
        let msgs = Array.from(
          document.querySelectorAll('[data-role="user"], [data-message-role="user"]')
        );
        if (msgs.length === 0) {
          msgs = Array.from(
            document.querySelectorAll('div[class*="user-message"], div[class*="UserMessage"], div[class*="human"]')
          );
        }
        if (msgs.length === 0) {
          // 兜底：右对齐的消息块通常是用户
          const allBlocks = document.querySelectorAll('div[class*="message"]');
          msgs = Array.from(allBlocks).filter(el => {
            const style = window.getComputedStyle(el);
            return style.alignSelf === 'flex-end' || el.className.includes('right');
          });
        }
        return msgs;
      },

      getChatContainer() {
        return (
          document.querySelector('div[class*="chat-content"]') ||
          document.querySelector('div[class*="conversation"]') ||
          document.querySelector('main')
        );
      },
    },

    /* ---- 豆包 Doubao (www.doubao.com) ---- */
    doubao: {
      match: () => location.hostname === "www.doubao.com",

      getUserMessages() {
        // 豆包使用 data-testid 或 role 属性标识
        let msgs = Array.from(
          document.querySelectorAll('[data-role="user"], [data-testid*="user"]')
        );
        if (msgs.length === 0) {
          msgs = Array.from(
            document.querySelectorAll('div[class*="user-message"], div[class*="human-message"], div[class*="UserMessage"]')
          );
        }
        if (msgs.length === 0) {
          // 兜底：按交替模式
          const allMsgs = document.querySelectorAll('div[class*="message-content"], div[class*="chat-message"]');
          msgs = Array.from(allMsgs).filter((_, i) => i % 2 === 0);
        }
        return msgs;
      },

      getChatContainer() {
        return (
          document.querySelector('div[class*="chat-body"]') ||
          document.querySelector('div[class*="conversation"]') ||
          document.querySelector('main')
        );
      },
    },

    /* ---- Kimi (www.kimi.com) ---- */
    kimi: {
      match: () => location.hostname === "www.kimi.com",

      getUserMessages() {
        // Kimi 使用 data-role="user" 或特定 class
        let msgs = Array.from(
          document.querySelectorAll('[data-role="user"], [data-author="user"]')
        );
        if (msgs.length === 0) {
          msgs = Array.from(
            document.querySelectorAll('div[class*="user-message"], div[class*="UserMessage"], div[class*="human"]')
          );
        }
        if (msgs.length === 0) {
          // 兜底
          const allMsgs = document.querySelectorAll('div[class*="message"]');
          msgs = Array.from(allMsgs).filter((_, i) => i % 2 === 0);
        }
        return msgs;
      },

      getChatContainer() {
        return (
          document.querySelector('div[class*="chat-list"]') ||
          document.querySelector('div[class*="conversation"]') ||
          document.querySelector('main')
        );
      },
    },
  };

  /* ================================================================
   *  通用兜底适配器
   *  当所有平台特定选择器都失败时，用通用启发式方法
   * ================================================================ */

  const UNIVERSAL_FALLBACK = {
    getUserMessages() {
      // 尝试所有常见的 data-role / data-message-author-role 属性
      const selectors = [
        '[data-message-author-role="user"]',
        '[data-role="user"]',
        '[data-message-role="user"]',
        '[data-author="user"]',
        '[data-testid*="user"]',
      ];
      for (const sel of selectors) {
        const msgs = Array.from(document.querySelectorAll(sel));
        if (msgs.length > 0) return msgs;
      }

      // 启发式：class 名中含 user/human 的消息块
      const classPatterns = [
        'div[class*="user-msg"]',
        'div[class*="user-message"]',
        'div[class*="UserMessage"]',
        'div[class*="human-message"]',
        'div[class*="human_message"]',
      ];
      for (const sel of classPatterns) {
        const msgs = Array.from(document.querySelectorAll(sel));
        if (msgs.length > 0) return msgs;
      }

      return [];
    },

    getChatContainer() {
      return (
        document.querySelector('main') ||
        document.querySelector('[role="main"]') ||
        document.body
      );
    },
  };

  /* ================================================================
   *  检测当前平台
   * ================================================================ */

  let currentAdapter = null;

  function detectAdapter() {
    for (const [name, adapter] of Object.entries(ADAPTERS)) {
      if (adapter.match()) {
        console.log(`[GPT Timeline] Detected platform: ${name}`);
        return adapter;
      }
    }
    console.log("[GPT Timeline] No specific adapter matched, using universal fallback");
    return null;
  }

  function getUserMessages() {
    if (!currentAdapter) currentAdapter = detectAdapter();

    // 先用平台适配器
    if (currentAdapter) {
      const msgs = currentAdapter.getUserMessages();
      if (msgs.length > 0) return msgs;
    }

    // 回退到通用方法
    return UNIVERSAL_FALLBACK.getUserMessages();
  }

  function getChatContainer() {
    if (!currentAdapter) currentAdapter = detectAdapter();

    if (currentAdapter) {
      const container = currentAdapter.getChatContainer();
      if (container) return container;
    }

    return UNIVERSAL_FALLBACK.getChatContainer();
  }

  /* ================================================================
   *  以下是核心 UI 逻辑（与之前一致，不依赖具体平台）
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

  /* ---------- 动态定位 ---------- */

  function updatePosition() {
    if (!timeline) return;

    const chatArea = getChatContainer();

    if (chatArea && chatArea !== document.body) {
      const rect = chatArea.getBoundingClientRect();
      const rightEdge = rect.right;

      // 如果右边空间太小，放在屏幕右侧
      if (window.innerWidth - rightEdge < 50) {
        timeline.style.left = "auto";
        timeline.style.right = "12px";
        toggleBtn.style.left = "auto";
        toggleBtn.style.right = "12px";
      } else {
        timeline.style.right = "auto";
        timeline.style.left = (rightEdge + 8) + "px";
        toggleBtn.style.right = "auto";
        toggleBtn.style.left = (rightEdge + 12) + "px";
      }
    } else {
      timeline.style.left = "auto";
      timeline.style.right = Math.max(12, (window.innerWidth - 820) / 2 - 44) + "px";
      toggleBtn.style.left = "auto";
      toggleBtn.style.right = timeline.style.right;
    }
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

    if (msgs.length !== lastCount) {
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
      timer = setTimeout(updatePosition, 150);
    });
  }

  function setupObserver() {
    const observer = new MutationObserver(() => {
      setTimeout(tick, 300);
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  /* ---------- URL 变化检测（SPA 路由切换） ---------- */

  function setupRouteListener() {
    let lastUrl = location.href;
    const check = () => {
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        lastCount = 0;
        activeIndex = -1;
        currentAdapter = detectAdapter();
        setTimeout(tick, 500);
      }
    };
    // 监听 popstate
    window.addEventListener("popstate", check);
    // 定期检查（pushState 不触发 popstate）
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
