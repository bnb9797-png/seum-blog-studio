"use strict";

function setupCardNews({ getDraft, downloadFile, toast }) {
  const element = (id) => document.getElementById(id);
  const form = element("card-news-form");
  const title = element("card-title-input");
  const body = element("card-body-input");
  const theme = element("card-theme");
  const editor = element("card-text");
  const canvas = element("card-canvas");
  const ctx = canvas.getContext("2d");
  const save = element("card-save");
  const previous = element("card-prev");
  const next = element("card-next");
  const blogInput = element("card-blog-url");
  const caption = element("instagram-caption");
  const exportButton = element("instagram-zip");
  const exportStatus = element("instagram-export-status");
  const defaultBlog = "https://blog.naver.com/seum-7056";
  const blogStorageKey = "seum-instagram-blog";
  const width = 864;
  const pageLimit = 48;
  const font = '"Malgun Gothic", "Apple SD Gothic Neo", system-ui, sans-serif';
  const themes = {
    forest: { cover: "#153d33", page: "#f1f5eb", coverInk: "#f5fbeb", ink: "#193d33", accent: "#a9d171", rule: "#89ab74" },
    paper: { cover: "#603b2c", page: "#fcf4e6", coverInk: "#fff3df", ink: "#4f3228", accent: "#efbd78", rule: "#b88b5e" },
    ink: { cover: "#202d50", page: "#f0f3fb", coverInk: "#f7f9ff", ink: "#243456", accent: "#b3c5ff", rule: "#8b9dca" },
  };
  let cards = [];
  let index = 0;
  let exportPending = false;
  let importedTags = "";
  let blogDraft = { title: "", body: "", tags: "" };
  let blogUrl = defaultBlog;
  let addressInvalid = false;

  function normalizeBlog(value) {
    const input = value.trim();
    if (/^[a-z0-9_-]+$/i.test(input)) return "https://blog.naver.com/" + input;
    const candidate = /^(?:m\.)?blog\.naver\.com\//i.test(input) ? "https://" + input : input;
    try {
      const url = new URL(candidate);
      if (url.protocol !== "https:" || !["blog.naver.com", "m.blog.naver.com"].includes(url.hostname)
        || url.username || url.password || url.port || !/^\/[a-z0-9_-]+(?:\/\d+)?\/?$/i.test(url.pathname)) return "";
      return "https://blog.naver.com" + url.pathname.replace(/\/$/, "");
    } catch {
      return "";
    }
  }

  try {
    const savedBlog = localStorage.getItem(blogStorageKey);
    if (savedBlog !== null) blogUrl = normalizeBlog(savedBlog);
  } catch {
    // Keep the default if local storage is unavailable.
  }
  blogInput.value = blogUrl;

  function setError(id, message) {
    const error = element(id);
    error.textContent = message;
    error.hidden = !message;
  }

  function wrapText(text, size, weight) {
    ctx.font = weight + " " + size + "px " + font;
    return text.replace(/\r\n?/g, "\n").split("\n").flatMap((paragraph) => {
      const lines = [];
      let line = "";
      for (const word of paragraph.trim().split(/\s+/)) {
        const candidate = line ? line + " " + word : word;
        if (ctx.measureText(candidate).width <= width) {
          line = candidate;
          continue;
        }
        if (line) lines.push(line);
        line = "";
        for (const character of word) {
          if (line && ctx.measureText(line + character).width > width) {
            lines.push(line);
            line = "";
          }
          line += character;
        }
      }
      return [...lines, line];
    });
  }

  function paginate(text) {
    const pages = [];
    for (const paragraph of text.trim().split(/\n[ \t]*\n+/)) {
      const lines = wrapText(paragraph.trim(), 56, 650);
      for (let offset = 0; offset < lines.length; offset += 9) {
        const page = lines.slice(offset, offset + 9).join("\n").trim();
        if (page) pages.push(page);
      }
    }
    return pages;
  }

  function fit(text, cover) {
    const weight = cover ? 800 : 650;
    const limit = cover ? 760 : 820;
    for (let size = cover ? 93 : 64; size >= 30; size -= 3) {
      const lines = wrapText(text, size, weight);
      const leading = Math.ceil(size * 1.47);
      if (lines.length * leading <= limit) return { lines, leading, weight, size };
    }
    return null;
  }

  function draw(target, cardIndex, total, layout, colors, address) {
    const cover = cardIndex === 0;
    const ink = cover ? colors.coverInk : colors.ink;
    target.fillStyle = cover ? colors.cover : colors.page;
    target.fillRect(0, 0, canvas.width, canvas.height);
    target.fillStyle = colors.accent;
    target.fillRect(108, 108, 48, 9);
    target.fillStyle = ink;
    target.font = "700 30px " + font;
    target.fillText(cover ? "세움 블로그" : "세움 블로그  /  본문", 108, 176);
    target.strokeStyle = colors.rule;
    target.lineWidth = 2;
    target.beginPath();
    target.moveTo(108, 1172);
    target.lineTo(972, 1172);
    target.stroke();
    target.font = "700 28px " + font;
    target.fillText("세움 블로그 스튜디오", 108, 1220);
    target.textAlign = "right";
    target.fillText((cardIndex + 1) + " / " + total, 972, 1220);
    target.textAlign = "left";
    if (address) {
      target.font = "500 25px " + font;
      target.fillText(address.replace(/^https:\/\//, ""), 108, 1261, width);
    }
    if (layout) {
      target.font = layout.weight + " " + layout.size + "px " + font;
      const top = cover ? 665 - layout.lines.length * layout.leading / 2 : 270;
      layout.lines.forEach((line, row) => target.fillText(line, 108, top + row * layout.leading + layout.size));
    }
  }

  function paint() {
    const text = cards[index].trim();
    const cover = index === 0;
    const layout = text ? fit(text, cover) : null;
    draw(ctx, index, cards.length, layout, themes[theme.value], blogUrl);
    canvas.setAttribute("aria-label", (cover ? "표지" : "본문 카드 " + index) + " 미리보기");
    setError("card-fit-error", layout ? "" : text
      ? "한 장에 담기에는 문구가 너무 깁니다. 줄바꿈이나 글자 수를 줄여주세요."
      : "이 카드에 넣을 문구를 입력하세요.");
    save.disabled = !layout || addressInvalid || exportPending;
    exportButton.disabled = addressInvalid || exportPending;
  }

  function showCard() {
    editor.value = cards[index];
    element("card-position").textContent = (index === 0 ? "표지" : "본문 " + index) + " · " + (index + 1) + " / " + cards.length;
    previous.disabled = index === 0;
    next.disabled = index === cards.length - 1;
    paint();
  }

  if (!ctx) {
    setError("card-error", "이 브라우저에서 이미지를 그릴 수 없습니다. 다른 브라우저에서 열어주세요.");
    return;
  }

  function loadDraft(makeCards) {
    const draft = getDraft();
    if (!draft.title.trim() && !draft.body.trim()) {
      setError("card-error", "가져올 초안이 없습니다. 제목과 원고를 직접 입력할 수 있습니다.");
      return false;
    }
    if (draft.title.length > title.maxLength || draft.body.length > body.maxLength) {
      const message = "초안이 입력 한도를 넘습니다. 제목 150자, 원고 12,000자 이내로 입력해 주세요.";
      setError("card-error", message);
      if (makeCards) toast(message);
      return false;
    }
    if (makeCards) {
      if (!generate(draft.title, draft.body, draft.tags)) return false;
    } else if ((title.value.trim() || body.value.trim()) && !confirm("원고 입력 내용을 현재 블로그 초안으로 바꿀까요?")) return false;
    title.value = draft.title;
    body.value = draft.body;
    importedTags = draft.tags;
    setError("card-error", "");
    if (!makeCards) toast("블로그 초안을 가져왔습니다.");
    return true;
  }

  function captionFromCards() {
    const highlights = cards.slice(1).map((card) => card.trim().replace(/\s+/g, " "))
      .filter((text) => text && !text.startsWith("이번 글의 주제는"))
      .slice(0, 3).map((text) => {
        const characters = [...text];
        return "• " + (characters.length > 130 ? characters.slice(0, 129).join("").trimEnd() + "…" : text);
      });
    return [cards[0].trim(), highlights.join("\n"), blogDraft.tags.trim()].filter(Boolean).join("\n\n");
  }

  function generate(draftTitle, draftBody, tags) {
    const cover = draftTitle.trim();
    const content = draftBody.trim();
    if (!cover || !content) {
      setError("card-error", "표지 제목과 본문 원고를 입력하세요.");
      return false;
    }
    const pages = paginate(content);
    if (pages.length + 1 > pageLimit) {
      setError("card-error", "한 번에 표지를 포함해 최대 48장까지 만들 수 있습니다. 원고를 나눠 입력하세요.");
      if (location.hash !== "#card-news") toast("원고가 너무 깁니다. 카드뉴스 생성기에서 원고를 나눠 입력하세요.");
      return false;
    }
    if (cards.length && !confirm("현재 카드와 편집한 인스타그램 문구를 새로 만들까요?")) return false;
    cards = [cover, ...pages];
    blogDraft = { title: cover, body: content, tags: tags || "" };
    index = 0;
    caption.value = captionFromCards();
    exportStatus.textContent = "";
    setError("card-error", "");
    element("card-empty").hidden = true;
    element("card-result").hidden = false;
    element("instagram-package").hidden = false;
    showCard();
    toast("카드 " + cards.length + "장과 인스타그램 문구를 만들었습니다.");
    return true;
  }

  function updateAddress() {
    const input = blogInput.value.trim();
    const normalized = normalizeBlog(input);
    addressInvalid = Boolean(input && !normalized);
    blogInput.setAttribute("aria-invalid", String(addressInvalid));
    setError("card-url-error", addressInvalid ? "네이버 블로그 주소 또는 블로그 아이디를 입력하세요." : "");
    if (!addressInvalid) blogUrl = normalized;
    element("instagram-copy").disabled = addressInvalid;
    if (cards.length) paint();
    updateLinkNote();
  }

  function updateLinkNote() {
    element("instagram-link-note").textContent = addressInvalid ? "주소 형식을 확인하면 복사하거나 저장할 수 있습니다."
      : blogUrl ? "복사와 ZIP에 포함되는 블로그 주소  " + blogUrl : "블로그 주소를 입력하면 복사와 ZIP에 포함됩니다.";
  }

  function fullCaption() {
    const text = caption.value.trim();
    if (!blogUrl) return text;
    const tags = blogDraft.tags.trim();
    const hasTags = tags && text.endsWith("\n\n" + tags);
    const content = hasTags ? text.slice(0, -tags.length).trimEnd() : text;
    return [content, "자세한 내용은 네이버 블로그에서 확인하세요.\n" + blogUrl, hasTags ? tags : ""].filter(Boolean).join("\n\n");
  }

  updateLinkNote();
  blogInput.addEventListener("input", updateAddress);
  blogInput.addEventListener("change", () => {
    if (!addressInvalid) {
      blogInput.value = blogUrl;
      try { localStorage.setItem(blogStorageKey, blogUrl); } catch { /* The current tab can still use the address. */ }
    }
  });
  element("card-use-draft").addEventListener("click", () => loadDraft(false));
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    generate(title.value, body.value, importedTags);
  });

  theme.addEventListener("change", () => { if (cards.length) paint(); });
  previous.addEventListener("click", () => { if (index > 0) { index -= 1; showCard(); } });
  next.addEventListener("click", () => { if (index < cards.length - 1) { index += 1; showCard(); } });
  editor.addEventListener("input", () => { cards[index] = editor.value; paint(); });
  save.addEventListener("click", () => {
    const base = fileBase(cards[0]);
    const name = base + "-" + String(index + 1).padStart(2, "0") + ".png";
    exportPending = true;
    paint();
    canvas.toBlob((blob) => {
      exportPending = false;
      paint();
      if (blob) downloadFile(blob, name);
      else toast("PNG를 저장하지 못했습니다. 다시 시도해 주세요.");
    }, "image/png");
  });

  function fileBase(text) {
    return text.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-").trim().slice(0, 70) || "세움-카드뉴스";
  }

  element("instagram-rebuild").addEventListener("click", () => {
    const nextCaption = captionFromCards();
    if (caption.value === nextCaption || !caption.value.trim() || confirm("현재 문구를 카드 내용으로 다시 만들까요?")) caption.value = nextCaption;
  });
  element("instagram-copy").addEventListener("click", async () => {
    const text = fullCaption();
    if (!text) { toast("복사할 게시글 문구를 입력하세요."); return; }
    try {
      await navigator.clipboard.writeText(text);
      toast("인스타그램 게시글 문구를 복사했습니다.");
    } catch {
      downloadFile(new Blob(["\uFEFF", text], { type: "text/plain;charset=utf-8" }), "instagram-caption.txt");
      toast("클립보드를 사용할 수 없어 문구를 텍스트 파일로 저장했습니다.");
    }
  });

  exportButton.addEventListener("click", async () => {
    if (exportPending) return;
    const pages = cards.map((text, page) => text.trim() && fit(text.trim(), page === 0));
    const invalid = pages.findIndex((page) => !page);
    if (invalid !== -1) {
      index = invalid;
      showCard();
      exportStatus.textContent = (invalid + 1) + "번째 카드의 문구를 수정한 뒤 다시 저장하세요.";
      editor.focus();
      return;
    }
    const colors = themes[theme.value];
    const address = blogUrl;
    const captionText = fullCaption();
    const article = [blogDraft.title, blogDraft.body, blogDraft.tags, address].filter(Boolean).join("\n\n");
    const name = fileBase(cards[0]) + "-블로그-인스타그램.zip";
    exportPending = true;
    paint();
    exportStatus.textContent = "카드 이미지와 원고를 묶는 중입니다.";
    try {
      const image = document.createElement("canvas");
      image.width = canvas.width;
      image.height = canvas.height;
      const target = image.getContext("2d");
      if (!target) throw new Error("Canvas unavailable");
      const textFile = (value) => new Blob(["\uFEFF", value], { type: "text/plain;charset=utf-8" });
      const files = [{ name: "blog-draft.txt", blob: textFile(article) }, { name: "instagram-caption.txt", blob: textFile(captionText) }];
      for (const [page, layout] of pages.entries()) {
        draw(target, page, pages.length, layout, colors, address);
        const blob = await new Promise((resolve) => image.toBlob(resolve, "image/png"));
        if (!blob) throw new Error("PNG encoding failed");
        files.push({ name: "card-" + String(page + 1).padStart(2, "0") + ".png", blob });
      }
      downloadFile(await createCardNewsZip(files), name);
      exportStatus.textContent = "블로그 원고, 인스타그램 문구, 카드 이미지 " + pages.length + "장을 ZIP으로 저장했습니다.";
    } catch {
      exportStatus.textContent = "ZIP을 저장하지 못했습니다. 다시 시도하거나 카드를 한 장씩 저장하세요.";
    } finally {
      exportPending = false;
      paint();
    }
  });

  return { fromDraft: () => loadDraft(true) };
}
