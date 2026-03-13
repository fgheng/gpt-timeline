/**
 * GPT Timeline — content script
 *
 * 在 ChatGPT 页面右侧渲染一条「问题时间线」。
 * 每个用户提问对应一个小圆圈，悬停显示问题摘要，点击平滑滚动到该问题。
 */

(() => {
  "use strict";

  /* ---------- 常量 ---------- */
  const SCAN_INTERVAL = 1500;            // 扫描间隔 ms
  const PREVIEW_LEN   = 40;             // tooltip 显示的最大字符数
  const SCROLL_BEHAVIOR = "smooth";

  /* ---------- DOM 容器 ---------- */
  let timeline = null;
  let toggleBtn = null;
  let visible = true;

  /** 创建时间线容器和开关按钮 */
  function createTimeline() {
    if (document.getElementById("gpt-timeline")) return;

    timeline = document.createElement("div");
    timeline.id = "gpt-timeline";
    // 竖线
    const line = document.createElement("div");
    line.className = "tl-line";
    timeline.appendChild(line);
    document.body.appendChild(timeline);

    // 折叠开关
    toggleBtn = document.createElement("button");
    toggleBtn.id = "gpt-timeline-toggle";
    toggleBtn.title = "Toggle Timeline";
    toggleBtn.textContent = "◷";
    toggleBtn.addEventListener("click", () => {
      visible = !visible;
      timeline.classList.toggle("hidden", !visible);
      toggleBtn.textContent = visible ? "◷" : "◴";
    });
    document.body.appendChild(toggleBtn);
  }

  /* ---------- 扫描用户提问 ---------- */

  /**
   * 获取所有用户消息元素。
   * ChatGPT 的 DOM 结构可能变化，这里用多种选择器兜底。
   */
  function getUserMessages() {
    // ChatGPT 当前 (2024+) 使用 data-message-author-role
    let msgs = Array.from(
      document.querySelectorAll('[data-message-author-role="user"]')
    );

    // 兜底：如果上面选不到，尝试旧版选择器
    if (msgs.length === 0) {
      msgs = Array.from(
        document.querySelectorAll(
          'div.agent-turn[data-scroll-anchor] .whitespace-pre-wrap,' +
          'div[data-testid^="conversation-turn-"] div.whitespace-pre-wrap'
        )
      );
      // 只取偶数索引（用户消息）
      msgs = msgs.filter((_, i) => i % 2 === 0);
    }

    return msgs;
  }

  /** 从消息元素中提取纯文本摘要 */
  function extractPreview(el) {
    const text = (el.innerText || el.textContent || "").trim();
    if (text.length <= PREVIEW_LEN) return text;
    return text.slice(0, PREVIEW_LEN) + "…";
  }

  /* ---------- 渲染 ---------- */

  /** 当前高亮索引 */
  let activeIndex = -1;

  /** 根据扫描结果更新时间线 */
  function render(messages) {
    if (!timeline) return;

    // 清空旧节点（保留竖线）
    const oldNodes = timeline.querySelectorAll(".tl-node");
    oldNodes.forEach((n) => n.remove());

    messages.forEach((el, idx) => {
      const node = document.createElement("div");
      node.className = "tl-node";
      if (idx === activeIndex) node.classList.add("active");

      // 圆圈
      const dot = document.createElement("div");
      dot.className = "tl-dot";

      // Tooltip
      const tip = document.createElement("span");
      tip.className = "tl-tooltip";
      tip.textContent = `#${idx + 1}  ${extractPreview(el)}`;

      node.appendChild(dot);
      node.appendChild(tip);

      // 点击跳转
      node.addEventListener("click", () => {
        el.scrollIntoView({ behavior: SCROLL_BEHAVIOR, block: "center" });
        setActive(idx);
      });

      timeline.appendChild(node);
    });
  }

  function setActive(idx) {
    activeIndex = idx;
    const nodes = timeline.querySelectorAll(".tl-node");
    nodes.forEach((n, i) => n.classList.toggle("active", i === idx));
  }

  /* ---------- 视口高亮跟踪 ---------- */

  function updateActiveByScroll(messages) {
    // 找到距离视口中心最近的用户消息
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

  let lastCount = 0;

  function tick() {
    const msgs = getUserMessages();

    // 数量变化时重新渲染
    if (msgs.length !== lastCount) {
      lastCount = msgs.length;
      render(msgs);
    }

    // 更新高亮
    if (msgs.length > 0) {
      updateActiveByScroll(msgs);
    }
  }

  /* ---------- 入口 ---------- */

  function init() {
    createTimeline();
    tick();
    setInterval(tick, SCAN_INTERVAL);

    // 滚动时也更新高亮（节流）
    let scrollTimer = null;
    window.addEventListener(
      "scroll",
      () => {
        if (scrollTimer) return;
        scrollTimer = setTimeout(() => {
          scrollTimer = null;
          const msgs = getUserMessages();
          if (msgs.length) updateActiveByScroll(msgs);
        }, 120);
      },
      true   // capture，因为 ChatGPT 内部有自己的滚动容器
    );

    // 监听 ChatGPT 内部滚动容器
    const observer = new MutationObserver(() => {
      // 当 DOM 变化时也 tick 一次（如切换对话）
      setTimeout(tick, 300);
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  // 确保 DOM ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
