# ✦ GPT Timeline

A minimal Chrome extension that adds a starlight timeline to AI chat pages, helping you navigate long conversations effortlessly.

![Chrome Extension](https://img.shields.io/badge/Chrome-Extension-blue?logo=googlechrome&logoColor=white)
![Manifest V3](https://img.shields.io/badge/Manifest-V3-green)

### Supported Platforms

| Platform | URL |
|----------|-----|
| ChatGPT | https://chatgpt.com/ |
| DeepSeek | https://chat.deepseek.com/ |
| 通义千问 Qwen | https://chat.qwen.ai/ |
| 豆包 Doubao | https://www.doubao.com/chat/ |
| Kimi | https://www.kimi.com/ |

## What it does

When you're deep in a long ChatGPT conversation, it's hard to scroll back and find a specific question you asked. GPT Timeline solves this by placing an elegant timeline alongside the chat — each star represents one of your questions. Hover to preview, click to jump.

## Features

- ✦ **Starlight dots** — each user question becomes a glowing star on the timeline
- 🔍 **Hover preview** — see the full question text in a floating tooltip
- 🖱️ **Click to jump** — smooth scroll to any question instantly
- 🟢 **Active tracking** — the current question is highlighted as you scroll
- 💫 **Breathing animation** — stars gently pulse to feel alive
- 🌓 **Dark & light mode** — adapts to your system theme
- 📌 **Toggle visibility** — collapse/expand with the ✦ button

## Install

1. Download or clone this repository:

   ```bash
   git clone https://github.com/your-username/gpt-timeline.git
   ```

2. Open Chrome and navigate to:

   ```
   chrome://extensions/
   ```

3. Enable **Developer mode** (toggle in the top-right corner)

4. Click **Load unpacked**

5. Select the `gpt-timeline` folder

6. Done! Open [chatgpt.com](https://chatgpt.com/) and you'll see the timeline on the right side of your conversation.

## Usage

| Action | Result |
|--------|--------|
| **Hover** a star | Shows the question text in a tooltip |
| **Click** a star | Scrolls to that question |
| **Click** the ✦ button (top) | Toggles the timeline on/off |
| **Scroll** the chat | Active star follows your position |

## How it looks

The timeline appears as a subtle vertical line with small dots to the right of the chat area:

```
┌──────────────────────────────┐
│  ChatGPT conversation        │  ·  ← star (question 1)
│                              │  ·  ← star (question 2)
│  ...                         │  ● ← active (question 3)  [ tooltip ]
│                              │  ·  ← star (question 4)
│                              │  ·  ← star (question 5)
└──────────────────────────────┘
```

- Default stars: faint white dots with subtle glow
- Hovered star: bright with cross-shaped rays (✦ effect)
- Active star: green glow indicating current position
- Tooltip: appears to the right, in the blank area — never blocks the chat

## File structure

```
gpt-timeline/
├── manifest.json   # Chrome extension manifest (V3)
├── content.js      # Core logic — scan questions, render timeline, handle interactions
├── styles.css      # All styling — stars, animations, tooltip, theme support
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── README.md
```

## Requirements

- Google Chrome (or any Chromium-based browser)
- Works on ChatGPT, DeepSeek, Qwen, Doubao, Kimi (see supported platforms above)
- Each platform has its own DOM adapter with multiple fallback selectors

## Notes

- The extension scans for user messages every 1.5 seconds and on DOM changes
- No data is collected or sent anywhere — everything runs locally
- If a platform updates its DOM structure, the selectors may need updating — check the `ADAPTERS` object in `content.js`
- Adding a new platform: add an adapter entry in `content.js` and a URL pattern in `manifest.json`

## License

MIT
