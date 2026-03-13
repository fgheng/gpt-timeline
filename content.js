/**
 * GPT Timeline — 星光时间线
 *
 * 在 ChatGPT 对话区域右侧渲染一条优雅的时间线。
 * 每个用户提问对应一个星星圆点，悬停显示问题摘要 + 星芒动效，点击平滑滚动。
 */

(() => {
  "use strict";

  /* ---------- 常量 ---------- */
  const SCAN_INTERVAL   = 1500;
  const PREVIEW_LEN     = 200;  // tooltip 最多显示的字符数
  const SCROLL_BEHAVIOR = "smooth";

  /* ---------- 状态 ---------- */
  let timeline    = null;
  let toggleBtn   = null;
  let nodesWrap   = null;
  let visible     = true;
  let activeIndex = -1;
  let lastCount   = 0;
  let scrollContainer = null;

  /* ---------- DOM 创建 ---------- */

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

    // 折叠按钮
    toggleBtn = document.createElement("button");
    toggleBtn.id = "gpt-timeline-toggle";
    toggleBtn.title = "Toggle Timeline";
    toggleBtn.innerHTML = "✦";
    toggleBtn.addEventListener("click", () => {
      visible = !visible;
      timeline.classList.toggle("hidden", !visible);
      toggleBtn.innerHTML = visible ? "✦" : "✧";
    });
    document.body.appendChild(toggleBtn);

    // 初始定位
    updatePosition();
  }

  /* ---------- 动态定位：紧贴对话框右侧 ---------- */

  function updatePosition() {
    if (!timeline) return;

    // 尝试找到 ChatGPT 的对话容器
    const chatArea =
      document.querySelector('main .xl\\:max-w-\\[48rem\\]') ||
      document.querySelector('main [class*="max-w-"]') ||
      document.querySelector('main .flex.flex-col.items-center') ||
      document.querySelector('main article')?.parentElement?.parentElement;

    if (chatArea) {
      const rect = chatArea.getBoundingClientRect();
      const rightEdge = rect.right;
      timeline.style.right = "auto";
      timeline.style.left = (rightEdge + 8) + "px";
      toggleBtn.style.right = "auto";
      toggleBtn.style.left = (rightEdge + 12) + "px";
    } else {
      // fallback：基于视口宽度估算
      timeline.style.left = "auto";
      timeline.style.right = Math.max(12, (window.innerWidth - 820) / 2 - 44) + "px";
      toggleBtn.style.left = "auto";
      toggleBtn.style.right = timeline.style.right;
    }
  }

  /* ---------- 查找滚动容器 ---------- */

  function findScrollContainer() {
    if (scrollContainer && document.contains(scrollContainer)) return scrollContainer;

    // ChatGPT 的主滚动区域
    const candidates = [
      document.querySelector('main div[class*="overflow-y"]'),
      document.querySelector('main .flex-1.overflow-hidden > div'),
      document.querySelector('[role="presentation"]'),
      document.querySelector('main'),
    ];

    for (const el of candidates) {
      if (el && el.scrollHeight > el.clientHeight) {
        scrollContainer = el;
        return el;
      }
    }

    return document.documentElement;
  }

  /* ---------- 扫描用户消息 ---------- */

  function getUserMessages() {
    let msgs = Array.from(
      document.querySelectorAll('[data-message-author-role="user"]')
    );

    if (msgs.length === 0) {
      // 兜底选择器
      const turns = document.querySelectorAll('[data-testid^="conversation-turn-"]');
      turns.forEach((turn, i) => {
        if (i % 2 === 0) {
          const text = turn.querySelector('.whitespace-pre-wrap');
          if (text) msgs.push(text);
        }
      });
    }

    return msgs;
  }

  function extractPreview(el) {
    const text = (el.innerText || el.textContent || "").trim().replace(/\n+/g, " ");
    if (text.length <= PREVIEW_LEN) return text;
    return text.slice(0, PREVIEW_LEN) + "…";
  }

  /* ---------- 渲染 ---------- */

  function render(messages) {
    if (!nodesWrap) return;

    nodesWrap.innerHTML = "";

    messages.forEach((el, idx) => {
      const node = document.createElement("div");
      node.className = "tl-node";
      if (idx === activeIndex) node.classList.add("active");

      // 星星
      const star = document.createElement("div");
      star.className = "tl-star";

      // Tooltip — 显示完整问题
      const tip = document.createElement("span");
      tip.className = "tl-tooltip";

      const tipNum = document.createElement("span");
      tipNum.className = "tl-tooltip-num";
      tipNum.textContent = `Question #${idx + 1}`;

      const tipText = document.createElement("span");
      tipText.className = "tl-tooltip-text";
      tipText.textContent = extractPreview(el);

      tip.appendChild(tipNum);
      tip.appendChild(tipText);

      // 序号
      const badge = document.createElement("span");
      badge.className = "tl-badge";
      badge.textContent = idx + 1;

      node.appendChild(star);
      node.appendChild(tip);
      node.appendChild(badge);

      node.addEventListener("click", () => {
        el.scrollIntoView({ behavior: SCROLL_BEHAVIOR, block: "center" });
        setActive(idx);
      });

      // 涟漪效果
      node.addEventListener("mouseenter", () => {
        star.style.transition = "all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)";
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

  /* ---------- 滚动监听 ---------- */

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

    // 监听 window
    window.addEventListener("scroll", handler, true);

    // 同时监听内部容器
    const container = findScrollContainer();
    if (container && container !== document.documentElement) {
      container.addEventListener("scroll", handler, { passive: true });
    }
  }

  /* ---------- resize 响应 ---------- */

  function setupResizeListener() {
    let timer = null;
    window.addEventListener("resize", () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(updatePosition, 150);
    });
  }

  /* ---------- MutationObserver ---------- */

  function setupObserver() {
    const observer = new MutationObserver(() => {
      setTimeout(tick, 300);
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  /* ---------- 入口 ---------- */

  function init() {
    createTimeline();
    tick();
    setInterval(tick, SCAN_INTERVAL);
    setupScrollListener();
    setupResizeListener();
    setupObserver();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
