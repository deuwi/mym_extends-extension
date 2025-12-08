// emoji.js - Module pour la gestion de l'emoji picker
(function (contentAPI) {
  "use strict";

  let emojiPickerVisible = false;
  let currentInput = null;
  let emojiUsageCount = {}; // Track emoji usage frequency

  // Complete emoji list (947 emojis)
  const EMOJI_LIST = [
    "😀",
    "😃",
    "😄",
    "😁",
    "😆",
    "😅",
    "🤣",
    "😂",
    "🙂",
    "🙃",
    "😉",
    "😊",
    "😇",
    "🥰",
    "😍",
    "🤩",
    "😘",
    "😗",
    "☺️",
    "😚",
    "😙",
    "🥲",
    "😋",
    "😛",
    "😜",
    "🤪",
    "😝",
    "🤑",
    "🤗",
    "🤭",
    "🤫",
    "🤔",
    "🤐",
    "🤨",
    "😐",
    "😑",
    "😶",
    "😏",
    "😒",
    "🙄",
    "😬",
    "🤥",
    "😌",
    "😔",
    "😪",
    "🤤",
    "😴",
    "😷",
    "🤒",
    "🤕",
    "🤢",
    "🤮",
    "🤧",
    "🥵",
    "🥶",
    "🥴",
    "😵",
    "🤯",
    "🤠",
    "🥳",
    "🥸",
    "😎",
    "🤓",
    "🧐",
    "😕",
    "😟",
    "🙁",
    "☹️",
    "😮",
    "😯",
    "😲",
    "😳",
    "🥺",
    "😦",
    "😧",
    "😨",
    "😰",
    "😥",
    "😢",
    "😭",
    "😱",
    "😖",
    "😣",
    "😞",
    "😓",
    "😩",
    "😫",
    "🥱",
    "😤",
    "😡",
    "😠",
    "🤬",
    "😈",
    "👿",
    "💀",
    "☠️",
    "💩",
    "🤡",
    "👹",
    "👺",
    "👻",
    "👽",
    "👾",
    "🤖",
    "😺",
    "😸",
    "😹",
    "😻",
    "😼",
    "😽",
    "🙀",
    "😿",
    "😾",
    "🙈",
    "🙉",
    "🙊",
    "💋",
    "💌",
    "💘",
    "💝",
    "💖",
    "💗",
    "💓",
    "💞",
    "💕",
    "💟",
    "❣️",
    "💔",
    "❤️",
    "🧡",
    "💛",
    "💚",
    "💙",
    "💜",
    "🤎",
    "🖤",
    "🤍",
    "💯",
    "💢",
    "💥",
    "💫",
    "💦",
    "💨",
    "🕳️",
    "💣",
    "💬",
    "👁️‍🗨️",
    "🗨️",
    "🗯️",
    "💭",
    "💤",
    "👋",
    "🤚",
    "🖐️",
    "✋",
    "🖖",
    "👌",
    "🤌",
    "🤏",
    "✌️",
    "🤞",
    "🤟",
    "🤘",
    "🤙",
    "👈",
    "👉",
    "👆",
    "🖕",
    "👇",
    "☝️",
    "👍",
    "👎",
    "✊",
    "👊",
    "🤛",
    "🤜",
    "👏",
    "🙌",
    "👐",
    "🤲",
    "🤝",
    "🙏",
    "✍️",
    "💅",
    "🤳",
    "💪",
    "🦾",
    "🦿",
    "🦵",
    "🦶",
    "👂",
    "🦻",
    "👃",
    "🧠",
    "🫀",
    "🫁",
    "🦷",
    "🦴",
    "👀",
    "👁️",
    "👅",
    "👄",
    "👶",
    "🧒",
    "👦",
    "👧",
    "🧑",
    "👱",
    "👨",
    "🧔",
    "👨‍🦰",
    "👨‍🦱",
    "👨‍🦳",
    "👨‍🦲",
    "👩",
    "👩‍🦰",
    "👩‍🦱",
    "👩‍🦳",
    "👩‍🦲",
    "🧓",
    "👴",
    "👵",
    "🙍",
    "🙎",
    "🙅",
    "🙆",
    "💁",
    "🙋",
    "🧏",
    "🙇",
    "🤦",
    "🤷",
    "👮",
    "🕵️",
    "💂",
    "🥷",
    "👷",
    "🤴",
    "👸",
    "👳",
    "👲",
    "🧕",
    "🤵",
    "👰",
    "🤰",
    "🤱",
    "👼",
    "🎅",
    "🤶",
    "🦸",
    "🦹",
    "🧙",
    "🧚",
    "🧛",
    "🧜",
    "🧝",
    "🧞",
    "🧟",
    "💆",
    "💇",
    "🚶",
    "🧍",
    "🧎",
    "🏃",
    "💃",
    "🕺",
    "🕴️",
    "👯",
    "🧖",
    "🧗",
    "🤺",
    "🏇",
    "⛷️",
    "🏂",
    "🏌️",
    "🏄",
    "🚣",
    "🏊",
    "⛹️",
    "🏋️",
    "🚴",
    "🚵",
    "🤸",
    "🤼",
    "🤽",
    "🤾",
    "🤹",
    "🧘",
    "🛀",
    "🛌",
    "🎪",
    "🎭",
    "🎨",
    "🎬",
    "🎤",
    "🎧",
    "🎼",
    "🎹",
    "🥁",
    "🎷",
    "🎺",
    "🎸",
    "🪕",
    "🎻",
    "🎲",
    "♟️",
    "🎯",
    "🎳",
    "🎮",
    "🎰",
    "🧩",
    "🚗",
    "🚕",
    "🚙",
    "🚌",
    "🚎",
    "🏎️",
    "🚓",
    "🚑",
    "🚒",
    "🚐",
    "🛻",
    "🚚",
    "🚛",
    "🚜",
    "🦯",
    "🦽",
    "🦼",
    "🛴",
    "🚲",
    "🛵",
    "🏍️",
    "🛺",
    "🚨",
    "🚔",
    "🚍",
    "🚘",
    "🚖",
    "🚡",
    "🚠",
    "🚟",
    "🚃",
    "🚋",
    "🚞",
    "🚝",
    "🚄",
    "🚅",
    "🚈",
    "🚂",
    "🚆",
    "🚇",
    "🚊",
    "🚉",
    "✈️",
    "🛫",
    "🛬",
    "🛩️",
    "💺",
    "🛰️",
    "🚀",
    "🛸",
    "🚁",
    "🛶",
    "⛵",
    "🚤",
    "🛥️",
    "🛳️",
    "⛴️",
    "🚢",
    "⚓",
    "⛽",
    "🚧",
    "🚦",
    "🚥",
    "🗺️",
    "🗿",
    "🗽",
    "🗼",
    "🏰",
    "🏯",
    "🏟️",
    "🎡",
    "🎢",
    "🎠",
    "⛲",
    "⛱️",
    "🏖️",
    "🏝️",
    "🏜️",
    "🌋",
    "⛰️",
    "🏔️",
    "🗻",
    "🏕️",
    "⛺",
    "🏠",
    "🏡",
    "🏘️",
    "🏚️",
    "🏗️",
    "🏭",
    "🏢",
    "🏬",
    "🏣",
    "🏤",
    "🏥",
    "🏦",
    "🏨",
    "🏪",
    "🏫",
    "🏩",
    "💒",
    "🏛️",
    "⛪",
    "🕌",
    "🕍",
    "🛕",
    "🕋",
    "⛩️",
    "🛤️",
    "🛣️",
    "🗾",
    "🎑",
    "🏞️",
    "🌅",
    "🌄",
    "🌠",
    "🎇",
    "🎆",
    "🌇",
    "🌆",
    "🏙️",
    "🌃",
    "🌌",
    "🌉",
    "🌁",
    "⌚",
    "📱",
    "📲",
    "💻",
    "⌨️",
    "🖥️",
    "🖨️",
    "🖱️",
    "🖲️",
    "🕹️",
    "🗜️",
    "💽",
    "💾",
    "💿",
    "📀",
    "📼",
    "📷",
    "📸",
    "📹",
    "🎥",
    "📽️",
    "🎞️",
    "📞",
    "☎️",
    "📟",
    "📠",
    "📺",
    "📻",
    "🎙️",
    "🎚️",
    "🎛️",
    "🧭",
    "⏱️",
    "⏲️",
    "⏰",
    "🕰️",
    "⌛",
    "⏳",
    "📡",
    "🔋",
    "🔌",
    "💡",
    "🔦",
    "🕯️",
    "🪔",
    "🧯",
    "🛢️",
    "💸",
    "💵",
    "💴",
    "💶",
    "💷",
    "🪙",
    "💰",
    "💳",
    "💎",
    "⚖️",
    "🪜",
    "🧰",
    "🪛",
    "🔧",
    "🔨",
    "⚒️",
    "🛠️",
    "⛏️",
    "🪚",
    "🔩",
    "⚙️",
    "🪤",
    "🧱",
    "⛓️",
    "🧲",
    "🔫",
    "💣",
    "🧨",
    "🪓",
    "🔪",
    "🗡️",
    "⚔️",
    "🛡️",
    "🚬",
    "⚰️",
    "🪦",
    "⚱️",
    "🏺",
    "🔮",
    "📿",
    "🧿",
    "💈",
    "⚗️",
    "🔭",
    "🔬",
    "🕳️",
    "🩹",
    "🩺",
    "💊",
    "💉",
    "🩸",
    "🧬",
    "🦠",
    "🧫",
    "🧪",
    "🌡️",
    "🧹",
    "🪠",
    "🧺",
    "🧻",
    "🚽",
    "🚰",
    "🚿",
    "🛁",
    "🛀",
    "🧼",
    "🪒",
    "🧽",
    "🧴",
    "🛎️",
    "🔑",
    "🗝️",
    "🚪",
    "🪑",
    "🛋️",
    "🛏️",
    "🛌",
    "🧸",
    "🪆",
    "🖼️",
    "🪞",
    "🪟",
    "🛍️",
    "🛒",
    "🎁",
    "🎈",
    "🎏",
    "🎀",
    "🪄",
    "🪅",
    "🎊",
    "🎉",
    "🎎",
    "🏮",
    "🎐",
    "🧧",
    "✉️",
    "📩",
    "📨",
    "📧",
    "💌",
    "📥",
    "📤",
    "📦",
    "🏷️",
    "🪧",
    "📪",
    "📫",
    "📬",
    "📭",
    "📮",
    "📯",
    "📜",
    "📃",
    "📄",
    "📑",
    "🧾",
    "📊",
    "📈",
    "📉",
    "🗒️",
    "🗓️",
    "📆",
    "📅",
    "🗑️",
    "📇",
    "🗃️",
    "🗳️",
    "🗄️",
    "📋",
    "📁",
    "📂",
    "🗂️",
    "🗞️",
    "📰",
    "📓",
    "📔",
    "📒",
    "📕",
    "📗",
    "📘",
    "📙",
    "📚",
    "📖",
    "🔖",
    "🧷",
    "🔗",
    "📎",
    "🖇️",
    "📐",
    "📏",
    "🧮",
    "📌",
    "📍",
    "✂️",
    "🖊️",
    "🖋️",
    "✒️",
    "🖌️",
    "🖍️",
    "📝",
    "✏️",
    "🔍",
    "🔎",
    "🔏",
    "🔐",
    "🔒",
    "🔓",
    "❤️",
    "🧡",
    "💛",
    "💚",
    "💙",
    "💜",
    "🖤",
    "🤍",
    "🤎",
    "❤️‍🔥",
    "❤️‍🩹",
    "💔",
    "❣️",
    "💕",
    "💞",
    "💓",
    "💗",
    "💖",
    "💘",
    "💝",
    "💟",
    "☮️",
    "✝️",
    "☪️",
    "🕉️",
    "☸️",
    "✡️",
    "🔯",
    "🕎",
    "☯️",
    "☦️",
    "🛐",
    "⛎",
    "♈",
    "♉",
    "♊",
    "♋",
    "♌",
    "♍",
    "♎",
    "♏",
    "♐",
    "♑",
    "♒",
    "♓",
    "🆔",
    "⚛️",
    "🉑",
    "☢️",
    "☣️",
    "📴",
    "📳",
    "🈶",
    "🈚",
    "🈸",
    "🈺",
    "🈷️",
    "✴️",
    "🆚",
    "💮",
    "🉐",
    "㊙️",
    "㊗️",
    "🈴",
    "🈵",
    "🈹",
    "🈲",
    "🅰️",
    "🅱️",
    "🆎",
    "🆑",
    "🅾️",
    "🆘",
    "❌",
    "⭕",
    "🛑",
    "⛔",
    "📛",
    "🚫",
    "💯",
    "💢",
    "♨️",
    "🚷",
    "🚯",
    "🚳",
    "🚱",
    "🔞",
    "📵",
    "🚭",
    "❗",
    "❕",
    "❓",
    "❔",
    "‼️",
    "⁉️",
    "🔅",
    "🔆",
    "〽️",
    "⚠️",
    "🚸",
    "🔱",
    "⚜️",
    "🔰",
    "♻️",
    "✅",
    "🈯",
    "💹",
    "❇️",
    "✳️",
    "❎",
    "🌐",
    "💠",
    "Ⓜ️",
    "🌀",
    "💤",
    "🏧",
    "🚾",
    "♿",
    "🅿️",
    "🛗",
    "🈳",
    "🈂️",
    "🛂",
    "🛃",
    "🛄",
    "🛅",
    "🚹",
    "🚺",
    "🚼",
    "⚧️",
    "🚻",
    "🚮",
    "🎦",
    "📶",
    "🈁",
    "🔣",
    "ℹ️",
    "🔤",
    "🔡",
    "🔠",
    "🆖",
    "🆗",
    "🆙",
    "🆒",
    "🆕",
    "🆓",
    "0️⃣",
    "1️⃣",
    "2️⃣",
    "3️⃣",
    "4️⃣",
    "5️⃣",
    "6️⃣",
    "7️⃣",
    "8️⃣",
    "9️⃣",
    "🔟",
    "🔢",
    "#️⃣",
    "*️⃣",
    "⏏️",
    "▶️",
    "⏸️",
    "⏯️",
    "⏹️",
    "⏺️",
    "⏭️",
    "⏮️",
    "⏩",
    "⏪",
    "⏫",
    "⏬",
    "◀️",
    "🔼",
    "🔽",
    "➡️",
    "⬅️",
    "⬆️",
    "⬇️",
    "↗️",
    "↘️",
    "↙️",
    "↖️",
    "↕️",
    "↔️",
    "↪️",
    "↩️",
    "⤴️",
    "⤵️",
    "🔀",
    "🔁",
    "🔂",
    "🔄",
    "🔃",
    "🎵",
    "🎶",
    "➕",
    "➖",
    "➗",
    "✖️",
    "🟰",
    "♾️",
    "💲",
    "💱",
    "™️",
    "©️",
    "®️",
    "〰️",
    "➰",
    "➿",
    "🔚",
    "🔙",
    "🔛",
    "🔝",
    "🔜",
    "✔️",
    "☑️",
    "🔘",
    "🔴",
    "🟠",
    "🟡",
    "🟢",
    "🔵",
    "🟣",
    "⚫",
    "⚪",
    "🟤",
    "🔺",
    "🔻",
    "🔸",
    "🔹",
    "🔶",
    "🔷",
    "🔳",
    "🔲",
    "▪️",
    "▫️",
    "◾",
    "◽",
    "◼️",
    "◻️",
    "🟥",
    "🟧",
    "🟨",
    "🟩",
    "🟦",
    "🟪",
    "⬛",
    "⬜",
    "🟫",
    "🔈",
    "🔇",
    "🔉",
    "🔊",
    "🔔",
    "🔕",
    "📣",
    "📢",
    "👁️‍🗨️",
    "💬",
    "💭",
    "🗯️",
    "♠️",
    "♣️",
    "♥️",
    "♦️",
    "🃏",
    "🎴",
    "🀄",
    "🕐",
    "🕑",
    "🕒",
    "🕓",
    "🕔",
    "🕕",
    "🕖",
    "🕗",
    "🕘",
    "🕙",
    "🕚",
    "🕛",
    "🕜",
    "🕝",
    "🕞",
    "🕟",
    "🕠",
    "🕡",
    "🕢",
    "🕣",
    "🕤",
    "🕥",
    "🕦",
    "🕧",
  ];

  // Emoji categories for better organization
  const EMOJI_CATEGORIES = {
    Smileys: EMOJI_LIST.slice(0, 120),
    Gestures: EMOJI_LIST.slice(120, 220),
    People: EMOJI_LIST.slice(220, 320),
    Animals: EMOJI_LIST.slice(320, 380),
    Objects: EMOJI_LIST.slice(380, 580),
    Symbols: EMOJI_LIST.slice(580, 720),
    Flags: EMOJI_LIST.slice(720, 820),
    Other: EMOJI_LIST.slice(820),
  };

  /**
   * Get frequently used emojis
   */
  function getFrequentEmojis(limit = 20) {
    return Object.entries(emojiUsageCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([emoji]) => emoji);
  }

  /**
   * Track emoji usage
   */
  function trackEmojiUsage(emoji) {
    emojiUsageCount[emoji] = (emojiUsageCount[emoji] || 0) + 1;
    contentAPI.safeStorageSet("local", { emoji_usage: emojiUsageCount });
  }

  /**
   * Create emoji picker UI
   */
  function createEmojiPicker() {
    const picker = document.createElement("div");
    picker.id = "mym-emoji-picker";
    picker.style.cssText = `
      position: fixed;
      bottom: 80px;
      right: 20px;
      width: 100%;
      max-width: 300px;
      max-height: 300px;
      background: linear-gradient(135deg, ${window.APP_CONFIG.PRIMARY_GRADIENT_START} 0%, ${window.APP_CONFIG.PRIMARY_GRADIENT_END} 100%);
      border: 1px solid #ccc;
      border-radius: 12px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      z-index: 10000;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    `;

    // Emoji grid
    const grid = document.createElement("div");
    grid.id = "mym-emoji-grid";
    grid.style.cssText = `
      padding: 12px;
      overflow-y: auto;
      flex: 1;
      display: grid;
      grid-template-columns: repeat(8, 1fr);
      gap: 4px;
    `;

    // Add all emojis by category
    for (const [category, emojis] of Object.entries(EMOJI_CATEGORIES)) {
      const categoryHeader = document.createElement("div");
      categoryHeader.style.cssText =
        "grid-column: 1 / -1; font-size: 11px; color: #fff; margin-top: 8px; margin-bottom: 4px; font-weight: 600;";
      categoryHeader.textContent = category;
      grid.appendChild(categoryHeader);

      emojis.forEach((emoji) => {
        const btn = createEmojiButton(emoji);
        grid.appendChild(btn);
      });
    }

    picker.appendChild(grid);

    // Add frequent emojis section at bottom
    const frequentEmojis = getFrequentEmojis();
    if (frequentEmojis.length > 0) {
      const frequentSection = document.createElement("div");
      frequentSection.style.cssText = `
        padding: 12px;
        border-top: 1px solid ${window.APP_CONFIG.BORDER_LIGHT};
        background: linear-gradient(135deg, ${window.APP_CONFIG.PRIMARY_GRADIENT_START} 0%, ${window.APP_CONFIG.PRIMARY_GRADIENT_END} 100%);
      `;

      const frequentTitle = document.createElement("div");
      frequentTitle.style.cssText =
        "font-size: 11px; color: #fff; margin-bottom: 8px; font-weight: 600;";
      frequentTitle.textContent = "⭐ Fréquents";

      const frequentGrid = document.createElement("div");
      frequentGrid.style.cssText =
        "display: grid; grid-template-columns: repeat(8, 1fr); gap: 4px;";

      frequentEmojis.forEach((emoji) => {
        const btn = createEmojiButton(emoji);
        frequentGrid.appendChild(btn);
      });

      frequentSection.appendChild(frequentTitle);
      frequentSection.appendChild(frequentGrid);
      picker.appendChild(frequentSection);
    }

    return picker;
  }

  /**
   * Create emoji button
   */
  function createEmojiButton(emoji) {
    const btn = document.createElement("button");
    btn.className = "mym-emoji-btn";
    btn.textContent = emoji;
    btn.style.cssText = `
      background: none;
      border: none;
      font-size: 18px;
      cursor: pointer;
      padding: 2px;
      border-radius: 4px;
      transition: all 0.2s;
    `;

    btn.addEventListener("mouseenter", () => {
      btn.style.background = window.APP_CONFIG.HOVER_OVERLAY;
      btn.style.transform = "scale(1.15)";
    });

    btn.addEventListener("mouseleave", () => {
      btn.style.background = "none";
      btn.style.transform = "scale(1)";
    });

    btn.addEventListener("click", () => insertEmoji(emoji));

    return btn;
  }

  /**
   * Insert emoji into input
   */
  function insertEmoji(emoji) {
    if (!currentInput) return;

    const start = currentInput.selectionStart;
    const end = currentInput.selectionEnd;
    const text = currentInput.value;

    currentInput.value = text.substring(0, start) + emoji + text.substring(end);
    currentInput.selectionStart = currentInput.selectionEnd =
      start + emoji.length;

    currentInput.focus();
    currentInput.dispatchEvent(new Event("input", { bubbles: true }));

    trackEmojiUsage(emoji);
    hideEmojiPicker();
  }

  /**
   * Track emoji usage for frequent emojis
   */
  async function trackEmojiUsage(emoji) {
    try {
      const data = await contentAPI.safeStorageGet("local", ["emoji_usage"]);
      emojiUsageCount = data.emoji_usage || {};
      emojiUsageCount[emoji] = (emojiUsageCount[emoji] || 0) + 1;
      await contentAPI.safeStorageSet("local", {
        emoji_usage: emojiUsageCount,
      });
      updateFrequentEmojis();
    } catch (error) {
      console.error("Error tracking emoji usage:", error);
    }
  }

  /**
   * Update frequent emojis display
   */
  async function updateFrequentEmojis() {
    try {
      const data = await contentAPI.safeStorageGet("local", ["emoji_usage"]);
      const usageData = data.emoji_usage || {};

      // Sort by usage count and get top 8
      const sorted = Object.entries(usageData)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8);

      const grid = document.getElementById("mym-frequent-grid");
      const section = document.getElementById("mym-frequent-emojis");

      if (!grid || !section) return;

      // Hide section if no frequent emojis
      if (sorted.length === 0) {
        section.style.display = "none";
        return;
      }

      // Show section and rebuild grid
      section.style.display = "block";
      grid.innerHTML = "";

      sorted.forEach(([emoji]) => {
        const btn = document.createElement("button");
        btn.className = "mym-emoji-btn";
        btn.textContent = emoji;
        btn.title = emoji;

        btn.addEventListener("mouseenter", () => {
          btn.style.background = "rgba(0,0,0,0.05)";
          btn.style.transform = "scale(1.2)";
        });

        btn.addEventListener("mouseleave", () => {
          btn.style.background = "none";
          btn.style.transform = "scale(1)";
        });

        btn.addEventListener("click", () => insertEmoji(emoji));

        grid.appendChild(btn);
      });
    } catch (error) {
      console.error("Error updating frequent emojis:", error);
    }
  }

  /**
   * Show emoji picker
   */
  function showEmojiPicker(inputElement) {
    if (!contentAPI.emojiEnabled) return;

    currentInput = inputElement;

    let picker = document.getElementById("mym-emoji-picker");
    if (!picker) {
      picker = createEmojiPicker();
      document.body.appendChild(picker);
    }

    // Update frequent emojis when showing picker
    updateFrequentEmojis();

    // Positionner le picker au-dessus de l'input
    const rect = inputElement.getBoundingClientRect();
    picker.style.position = "fixed";
    picker.style.bottom = `${window.innerHeight - rect.top + 10}px`;
    picker.style.right = "20px";
    picker.style.display = "flex";
    emojiPickerVisible = true;
  }

  /**
   * Hide emoji picker
   */
  function hideEmojiPicker() {
    const picker = document.getElementById("mym-emoji-picker");
    if (picker) {
      picker.style.display = "none";
    }
    emojiPickerVisible = false;
    currentInput = null;
  }

  /**
   * Toggle emoji picker
   */
  function toggleEmojiPicker(inputElement) {
    if (emojiPickerVisible) {
      hideEmojiPicker();
    } else {
      showEmojiPicker(inputElement);
    }
  }

  /**
   * Add emoji button to input
   */
  function addEmojiButtonToInput(container) {
    if (!contentAPI.emojiEnabled) return;

    // Chercher le .input__field qui contient le textarea
    let inputField = container.querySelector(".input__field");
    if (
      !inputField &&
      container.classList &&
      container.classList.contains("input__field")
    ) {
      inputField = container;
    }

    if (!inputField) return;
    if (inputField.querySelector(".mym-emoji-trigger")) return;

    const textarea = inputField.querySelector('textarea, input[type="text"]');
    if (!textarea) return;

    const button = document.createElement("button");
    button.className = "mym-emoji-trigger";
    button.textContent = "😀";
    button.type = "button";
    button.style.cssText = `
      position: absolute;
      right: 8px;
      bottom: 8px;
      background: linear-gradient(135deg, ${window.APP_CONFIG.PRIMARY_GRADIENT_START} 0%, ${window.APP_CONFIG.PRIMARY_GRADIENT_END} 100%);
      border: none;
      border-radius: 50%;
      width: 36px;
      height: 36px;
      padding: 0;
      font-size: 20px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
      transition: all 0.2s;
      z-index: 1000;
    `;

    button.addEventListener("mouseenter", () => {
      button.style.transform = "scale(1.1)";
    });

    button.addEventListener("mouseleave", () => {
      button.style.transform = "scale(1)";
    });

    button.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      toggleEmojiPicker(textarea);
    });

    inputField.style.position = "relative";
    inputField.appendChild(button);
  }

  /**
   * Initialize emoji picker
   */
  function initEmojiPicker() {
    // Load saved emoji usage
    contentAPI.safeStorageGet("local", ["emoji_usage"]).then((data) => {
      if (data.emoji_usage) {
        emojiUsageCount = data.emoji_usage;
      }
    });

    // Close picker when clicking outside
    document.addEventListener("click", (e) => {
      const picker = document.getElementById("mym-emoji-picker");
      if (
        picker &&
        emojiPickerVisible &&
        !picker.contains(e.target) &&
        !e.target.classList.contains("mym-emoji-trigger")
      ) {
        hideEmojiPicker();
      }
    });
  }

  // Export public API
  contentAPI.emoji = {
    showEmojiPicker,
    hideEmojiPicker,
    toggleEmojiPicker,
    addEmojiButtonToInput,
    initEmojiPicker,
  };

  // // // console.log("✅ [MYM Emoji] Module loaded");
})(window.MYM_CONTENT_API);
