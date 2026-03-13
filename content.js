/**
 * GPT Timeline — 星光时间线
 *
 * 在 ChatGPT 对话区域右侧渲染一条优雅的时间线。
 * Tooltip 挂在 document.body 上，不受任何容器 overflow 裁切。
 */

(() => {
  "use strict";

  /* ---------- 常量 ---------- */
  const SCAN_INTERVAL   = 1500;
  const MAX_TEXT_LEN    = 300;
  const SCROLL_BEHAVIOR = "smooth";

  /* ---------- 状态 ---------- */
  let timeline    = null;
  let toggleBtn   = null;
  let nodesWrap   = null;
  let tooltip     = null;   // 全局唯一 tooltip，挂在 body
  let visible     = true;
  let activeIndex = -1;
  let lastCount   = 0;
  let hoverTimer  = null;
  let scrollContainer = null;

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

    // 填充内容
    tooltip.querySelector(".tl-tooltip-num").textContent = `Question #${idx + 1}`;
    tooltip.querySelector(".tl-tooltip-text").textContent = questionText;

    // 先设为可见但透明，用于测量尺寸
    tooltip.classList.remove("visible");
    tooltip.style.left = "-9999px";
    tooltip.style.top  = "0";
    tooltip.style.display = "block";

    // 读取 tooltip 实际尺寸
    const tipRect  = tooltip.getBoundingClientRect();
    const nodeRect = nodeEl.getBoundingClientRect();

    // 定位：tooltip 放在星星右侧，利用右边空白区域
    let top  = nodeRect.top + nodeRect.height / 2 - 22;
    let left = nodeRect.right + 10;

    // 计算右侧可用空间
    const rightSpace = window.innerWidth - nodeRect.right - 10;
    // 动态调整 tooltip 宽度以适应右侧空间
    const tooltipWidth = Math.min(320, Math.max(160, rightSpace - 16));
    tooltip.style.width = tooltipWidth + "px";

    // 如果右侧空间实在太小（< 100px），才回退到左侧
    if (rightSpace < 100) {
      left = nodeRect.left - tipRect.width - 10;
      tooltip.style.width = "320px";
      tooltip.classList.add("arrow-right");
      tooltip.classList.remove("arrow-left");
    } else {
      tooltip.classList.add("arrow-left");
      tooltip.classList.remove("arrow-right");
    }

    // 防止超出屏幕顶部/底部
    const margin = 8;
    if (top < margin) top = margin;
    if (top + tipRect.height > window.innerHeight - margin) {
      top = window.innerHeight - margin - tipRect.height;
    }

    // 防止超出右侧
    if (left + tooltipWidth > window.innerWidth - margin) {
      left = window.innerWidth - margin - tooltipWidth;
    }
    // 防止超出左侧
    if (left < margin) left = margin;

    tooltip.style.left = left + "px";
    tooltip.style.top  = top + "px";

    // 显示
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

    // 折叠按钮
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
      timeline.style.left = "auto";
      timeline.style.right = Math.max(12, (window.innerWidth - 820) / 2 - 44) + "px";
      toggleBtn.style.left = "auto";
      toggleBtn.style.right = timeline.style.right;
    }
  }

  /* ---------- 扫描用户消息 ---------- */

  function getUserMessages() {
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
  }

  function extractText(el) {
    const text = (el.innerText || el.textContent || "").trim().replace(/\n{3,}/g, "\n\n");
    if (text.length <= MAX_TEXT_LEN) return text;
    return text.slice(0, MAX_TEXT_LEN) + "…";
  }

  /* ---------- 渲染 ---------- */

  // 保存每个节点对应的消息元素和文本
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

      // Hover → 显示全局 tooltip
      node.addEventListener("mouseenter", () => {
        clearTimeout(hoverTimer);
        showTooltip(node, idx, questionText);
      });

      node.addEventListener("mouseleave", () => {
        hoverTimer = setTimeout(hideTooltip, 120);
      });

      // 点击跳转
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

  /* ---------- Tooltip 也可以 hover（便于滚动长内容） ---------- */

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

  /* ---------- 入口 ---------- */

  function init() {
    createTooltip();
    createTimeline();
    setupTooltipHover();
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
