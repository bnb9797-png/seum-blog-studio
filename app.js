"use strict";

const $ = (id) => document.getElementById(id);
const all = (selector) => [...document.querySelectorAll(selector)];
const storageKey = "seum-studio-v1";
const bodyTarget = 4000;
const officeDefaults = {
  address: "경주시 원효로 172", phone: "010-8530-7056", email: "seum-7056@naver.com", map: "", directions: "",
};
const fieldNames = ["topic", "keyword", "kind", "tone", "intent", "notes", "title", "body", "tags"];
const blank = () => ({
  id: null, step: 1, topic: "", keyword: "", kind: "guide", tone: "friendly",
  intent: "", notes: "", title: "", body: "", tags: "", options: [], verified: {}, imagePrompts: {},
});
let state = blank();
let drafts = [];
let office = { ...officeDefaults };
let showingPreview = false;
let saveWarning = false;
let toastTimer;

try {
  const saved = JSON.parse(localStorage.getItem(storageKey));
  if (saved) {
    state = { ...blank(), ...saved.state };
    drafts = Array.isArray(saved.drafts) ? saved.drafts : [];
    office = { ...officeDefaults, ...saved.office };
  }
} catch {
  saveWarning = true;
}

function toast(message) {
  clearTimeout(toastTimer);
  $("toast").textContent = message;
  $("toast").hidden = false;
  toastTimer = setTimeout(() => { $("toast").hidden = true; }, 3600);
}

function persist() {
  try {
    localStorage.setItem(storageKey, JSON.stringify({ state, drafts, office }));
    saveWarning = false;
    return true;
  } catch {
    if (!saveWarning) toast("브라우저 저장에 실패했습니다. 글을 텍스트로 저장하세요.");
    saveWarning = true;
    return false;
  } finally {
    document.querySelector(".sidebar-note").lastChild.textContent = saveWarning
      ? " 브라우저 저장 사용 불가"
      : " 이 브라우저에 자동 저장";
  }
}

const templates = {
  guide: { endings: ["핵심 정보와 확인할 점", "처음 알아볼 때 확인할 것", "선택 전에 살펴볼 점"], lead: "알아두면 좋은 점", sections: ["먼저 확인할 점", "함께 알아둘 정보"] },
  review: { endings: ["경험을 바탕으로 정리한 후기", "이용 전에 알아두면 좋은 점", "후기와 선택 팁"], lead: "후기를 읽기 전에", sections: ["경험에서 확인한 점", "추가로 알아둘 점"] },
  compare: { endings: ["비교할 때 확인할 기준", "선택 기준 정리", "어떤 점을 살펴봐야 할까?"], lead: "비교 전에 확인할 점", sections: ["비교에 도움이 되는 정보", "결정 전에 살펴볼 사항"] },
  faq: { endings: ["자주 궁금해하는 점", "질문과 확인한 정보", "처음 알아볼 때의 궁금증"], lead: "이 글에서 다루는 질문", sections: ["질문과 관련해 확인한 내용", "함께 참고할 정보"] },
};
const tones = {
  friendly: "궁금했던 부분을 확인한 내용 위주로 정리해봤어요.",
  plain: "확인한 내용을 항목별로 정리했다.",
  formal: "아래에서 확인한 내용을 항목별로 살펴보겠습니다.",
};

function buildDraft(brief) {
  const topic = brief.topic.trim();
  const keyword = brief.keyword.trim();
  const intent = brief.intent.trim();
  const template = templates[brief.kind] || templates.guide;
  const notes = brief.notes.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const options = template.endings.map((ending) => topic + " | " + ending);
  const summary = ["이번 글의 주제는 ‘" + topic + "’입니다. " + (tones[brief.tone] || tones.friendly)];
  if (intent) summary.push(template.lead + "\n" + intent);
  const headings = [...template.sections, "구체적으로 살펴볼 내용", "마지막으로 확인할 점"];
  const groupSize = Math.max(1, Math.ceil(notes.length / headings.length));
  for (const [index, heading] of headings.entries()) {
    const group = notes.slice(index * groupSize, (index + 1) * groupSize);
    if (group.length) summary.push(heading + "\n" + group.join("\n\n"));
  }
  const compactTag = (value) => value.replace(/[^\p{L}\p{N}_]/gu, "").slice(0, 40);
  const tags = [...new Set([compactTag(keyword), compactTag(topic)].filter(Boolean))];
  return { title: options[0], body: summary.join("\n\n"), tags: tags.map((tag) => "#" + tag).join(" "), options };
}

const checks = [
  ["intent", "독자의 질문 정의", "글에서 답할 질문이나 독자의 목적을 적으세요.", () => Boolean(state.intent.trim())],
  ["facts", "경험과 확인한 정보", "직접 경험한 점이나 확인한 사실을 기획에 기록하세요.", () => Boolean(state.notes.trim())],
  ["topic", "제목에 주제 또는 키워드", "제목에서 글의 주제가 바로 드러나는지 확인하세요.", () => {
    const normalize = (value) => value.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
    const title = normalize(state.title);
    return [state.topic, state.keyword].map(normalize).some((term) => term && title.includes(term));
  }],
  ["answer", "본문에서 질문에 답했어요", "첫 문단이나 소제목에서 핵심 답을 찾을 수 있나요?"],
  ["evidence", "사실과 출처를 확인했어요", "바뀔 수 있는 정보는 확인 시점을 적고 출처를 살펴보세요."],
  ["natural", "표현과 키워드가 자연스러워요", "반복 표현을 줄이고 직접 관찰한 내용을 보강하세요."],
];

function buildChecks() {
  $("checks").replaceChildren(...checks.map(([id, title, description, test]) => {
    const row = document.createElement("li");
    const mark = document.createElement(test ? "span" : "input");
    mark.id = "check-" + id;
    if (test) {
      mark.className = "check-icon";
      mark.setAttribute("aria-hidden", "true");
    } else {
      mark.type = "checkbox";
      mark.setAttribute("aria-label", title);
      mark.setAttribute("aria-describedby", "check-detail-" + id);
      mark.addEventListener("change", () => {
        state.verified[id] = mark.checked;
        refresh();
        persist();
      });
    }
    const text = document.createElement("span");
    const heading = document.createElement("strong");
    const detail = document.createElement("small");
    heading.textContent = title;
    detail.id = "check-detail-" + id;
    detail.textContent = description;
    text.append(heading, detail);
    row.append(mark, text);
    return row;
  }));
}

function refresh() {
  let total = 0;
  for (const [id, , , test] of checks) {
    const mark = $("check-" + id);
    const done = test ? test() : Boolean(state.verified[id]);
    if (done) total += 1;
    if (test) {
      mark.classList.toggle("done", done);
      mark.innerHTML = done ? '<svg><use href="#check"/></svg>' : "·";
    } else {
      mark.checked = done;
      mark.disabled = !state.body.trim();
    }
  }
  $("progress").value = total;
  $("progress-text").textContent = total + " / " + checks.length;
  const count = [...state.body].length;
  const gap = bodyTarget - count;
  $("char-count").textContent = count.toLocaleString("ko-KR") + " / 4,000자";
  $("length-progress").value = Math.min(count, bodyTarget);
  $("length-detail").textContent = "공백·줄바꿈 포함 · " + (gap === 0 ? "목표 달성"
    : Math.abs(gap).toLocaleString("ko-KR") + (gap > 0
      ? "자 남음. 실제 사례나 구체적인 과정을 보강해 보세요."
      : "자 초과. 반복되거나 주제에서 벗어난 문장을 줄여보세요."));
  if (showingPreview) $("body-preview").textContent = state.body || "작성한 본문이 여기에 표시됩니다.";
  $("publish-title").textContent = state.title;
  $("publish-excerpt").textContent = state.body.length > 200 ? state.body.slice(0, 200) + "…" : state.body;
  $("draft-count").textContent = drafts.length;
  const hasDraft = Boolean(state.options.length || state.body.trim());
  const publishable = Boolean(state.title.trim() && state.body.trim());
  $("view-write").classList.toggle("is-editing", state.step === 2);
  for (const button of all("[data-step]")) {
    const step = Number(button.dataset.step);
    button.disabled = step === 2 ? !hasDraft : step === 3 && !publishable;
    if (step === state.step) button.setAttribute("aria-current", "step");
    else button.removeAttribute("aria-current");
  }
  for (const panel of all("[data-panel]")) panel.hidden = Number(panel.dataset.panel) !== state.step;
  $("save").disabled = !publishable;
  $("download").disabled = !state.body.trim();
  document.querySelector('[data-go="3"]').disabled = !publishable;
  for (const button of all("[data-make-instagram]")) button.disabled = !publishable;
  for (const button of all("[data-copy]")) button.disabled = !state[button.dataset.copy].trim();
}

function renderFields() {
  for (const id of fieldNames) {
    $(id).value = state[id];
    $(id).setCustomValidity("");
  }
  renderImagePrompt();
  $("title-options").replaceChildren(...state.options.map((option) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "button subtle";
    button.textContent = option;
    button.addEventListener("click", () => {
      state.title = option;
      state.verified = {};
      $("title").value = option;
      refresh();
      persist();
      toast("제목을 적용했습니다.");
    });
    return button;
  }));
  refresh();
}

function go(step) {
  state.step = step;
  if (step === 2) renderImagePrompt();
  refresh();
  persist();
  if (step === 2) $("title").focus();
  else document.querySelector('[data-panel="' + step + '"] input, [data-panel="' + step + '"] button').focus();
}

for (const id of fieldNames) {
  $(id).addEventListener("input", () => {
    state[id] = $(id).value;
    $(id).setCustomValidity("");
    if (id === "title" || id === "body" || id === "intent") state.verified = {};
    refresh();
    persist();
  });
}

for (const button of all("[data-step], [data-go]")) {
  button.addEventListener("click", () => go(Number(button.dataset.step || button.dataset.go)));
}

$("example").addEventListener("click", () => {
  if (["topic", "keyword", "intent", "notes"].some((key) => state[key].trim())
      && !confirm("현재 기획 입력란을 예시로 바꿀까요?")) return;
  Object.assign(state, {
    topic: "성수 작업 카페를 고를 때 확인한 점",
    keyword: "성수 작업 카페",
    kind: "guide",
    tone: "friendly",
    intent: "노트북 작업을 하려면 자리와 콘센트는 어떻게 확인하나요?",
    notes: "예시: 평일 오전에 방문했을 때 창가 자리 아래에서 콘센트를 확인했어요.\n예시: 점심시간에는 대화 소리가 커져 화상회의가 있다면 오전을 추천해요.\n예시: 콘센트 위치와 좌석 이용 시간은 방문 전에 매장에 문의해 보세요.",
    verified: {},
  });
  renderFields();
  persist();
  toast("예시를 불러왔습니다. 실제 경험으로 바꿔보세요.");
});

$("brief").addEventListener("submit", (event) => {
  event.preventDefault();
  for (const id of ["topic", "keyword", "notes"]) {
    if (!state[id].trim()) {
      $(id).setCustomValidity("내용을 입력해 주세요.");
      $(id).reportValidity();
      return;
    }
  }
  if (state.body.trim() && !confirm("기존 초안을 새로 생성한 내용으로 바꿀까요?")) return;
  Object.assign(state, buildDraft(state), { verified: {} });
  setPreview(false);
  renderFields();
  go(2);
  toast("초안을 만들었습니다.");
});

function renderDrafts() {
  const list = $("draft-list");
  if (!drafts.length) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = "보관한 초안이 없습니다. 초안 편집에서 ‘보관하기’를 눌러주세요.";
    list.replaceChildren(empty);
    return;
  }
  list.replaceChildren(...drafts.map((draft) => {
    const row = document.createElement("article");
    row.className = "draft-item";
    const info = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = draft.title;
    const date = document.createElement("small");
    date.textContent = new Date(draft.updatedAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", dateStyle: "medium", timeStyle: "short" });
    info.append(title, date);
    const open = document.createElement("button");
    open.type = "button";
    open.className = "button subtle";
    open.textContent = "열기";
    open.addEventListener("click", () => {
      if (!canReplace()) return;
      state = { ...blank(), ...draft, step: 2, verified: { ...draft.verified }, imagePrompts: { ...draft.imagePrompts } };
      setPreview(false);
      renderFields();
      persist();
      location.hash = "write";
    });
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "button subtle";
    remove.textContent = "삭제";
    remove.addEventListener("click", () => {
      if (!confirm("이 초안을 보관함에서 삭제할까요?")) return;
      drafts = drafts.filter((item) => item.id !== draft.id);
      if (state.id === draft.id) state.id = null;
      persist();
      refresh();
      renderDrafts();
    });
    row.append(info, open, remove);
    return row;
  }));
}

function canReplace() {
  const saved = drafts.find((draft) => draft.id === state.id) || blank();
  const edited = fieldNames.some((id) => state[id] !== saved[id])
    || JSON.stringify(state.imagePrompts) !== JSON.stringify(saved.imagePrompts ?? {});
  return !edited || confirm("보관하지 않은 작업을 바꿀까요?");
}

$("save").addEventListener("click", () => {
  state.id ||= globalThis.crypto?.randomUUID?.() ?? (Date.now() + "-" + Math.random().toString(36).slice(2));
  const snapshot = { ...state, verified: { ...state.verified }, imagePrompts: { ...state.imagePrompts }, updatedAt: new Date().toISOString() };
  drafts = [snapshot, ...drafts.filter((draft) => draft.id !== state.id)];
  const saved = persist();
  refresh();
  renderDrafts();
  toast(saved ? "초안 보관함에 저장했습니다." : "이 탭에서만 보관됩니다. 글을 텍스트로 저장하세요.");
});

$("new-draft").addEventListener("click", () => {
  if (!canReplace()) return;
  state = blank();
  setPreview(false);
  renderFields();
  persist();
  location.hash = "write";
});

for (const button of all("[data-copy]")) {
  button.addEventListener("click", async () => {
    const key = button.dataset.copy;
    try {
      await navigator.clipboard.writeText(state[key]);
      toast({ title: "제목", body: "본문", tags: "태그" }[key] + "을(를) 복사했습니다.");
    } catch {
      go(2);
      if (key === "body") setPreview(false);
      $(key).focus();
      $(key).select();
      toast("선택된 내용을 Ctrl+C 또는 ⌘C로 복사하세요.");
    }
  });
}

function setPreview(enabled) {
  showingPreview = enabled;
  $("body").hidden = enabled;
  $("editor-tools").hidden = enabled;
  $("body-preview").hidden = !enabled;
  $("body-preview").textContent = state.body || "작성한 본문이 여기에 표시됩니다.";
  $("preview-toggle").setAttribute("aria-pressed", String(enabled));
  $("preview-toggle").textContent = enabled ? "본문 편집" : "미리보기";
}

$("preview-toggle").addEventListener("click", () => setPreview(!showingPreview));

function insertBody(text, atEnd = false) {
  setPreview(false);
  const body = $("body");
  const cursor = atEnd ? body.value.length : body.selectionEnd;
  const prefix = cursor > 0 ? "\n\n" : "";
  const suffix = atEnd ? "" : "\n\n";
  const insertion = prefix + text + suffix;
  if (body.value.length + insertion.length > body.maxLength) {
    toast("본문이 입력 한도에 가까워 문구를 추가할 수 없습니다.");
    return;
  }
  body.setRangeText(insertion, cursor, cursor, "end");
  body.dispatchEvent(new Event("input", { bubbles: true }));
  body.focus();
}

$("insert-section").addEventListener("click", () => insertBody($("editor-section").value));

const photoStyles = {
  cover: "대표용 가로 사진, 16:9. 핵심 피사체가 한눈에 보이는 넓은 구도, 자연광, 절제된 녹색 계열, 한쪽에 여백.",
  detail: "본문 중간용 가로 사진, 4:3. 주제와 관련된 확인 포인트 한 가지를 보여주는 가까운 구도, 자연스러운 질감과 빛.",
  summary: "마무리용 정사각형 사진, 1:1. 핵심 개념을 보여주는 소품을 정돈한 위쪽 구도, 부드러운 그림자와 충분한 여백.",
};

function buildImagePrompt(brief, slot) {
  const topic = brief.topic.trim() || brief.title.trim() || "블로그 글의 주제";
  const keyword = brief.keyword.trim();
  const intent = brief.intent.trim();
  return [
    "블로그 글 ‘" + topic + "’에 사용할 설명용 이미지.",
    keyword ? "핵심 소재: " + keyword : "",
    intent ? "독자가 궁금해하는 점: " + intent : "",
    photoStyles[slot],
    "사실적인 사진 스타일로 표현하되 실제 방문 장소나 매물 사진처럼 오인될 수 있는 간판, 주소, 로고, 문구, 워터마크는 제외.",
  ].filter(Boolean).join("\n");
}

function renderImagePrompt() {
  const slot = $("image-slot").value;
  $("image-prompt").value = state.imagePrompts[slot] ?? buildImagePrompt(state, slot);
}

$("image-slot").addEventListener("change", renderImagePrompt);
$("image-prompt").addEventListener("input", () => {
  state.imagePrompts[$("image-slot").value] = $("image-prompt").value;
  persist();
});
$("reset-image").addEventListener("click", () => {
  delete state.imagePrompts[$("image-slot").value];
  renderImagePrompt();
  persist();
  toast("현재 이미지 용도의 자동 생성 문구를 적용했습니다.");
});
$("copy-image").addEventListener("click", async () => {
  const field = $("image-prompt");
  if (!field.value.trim()) return toast("복사할 프롬프트를 입력해 주세요.");
  try {
    await navigator.clipboard.writeText(field.value);
    toast("이미지 프롬프트를 복사했습니다.");
  } catch {
    field.focus();
    field.select();
    toast("선택된 내용을 Ctrl+C 또는 ⌘C로 복사하세요.");
  }
});

function mapLink(info) {
  if (info.map.trim()) {
    try {
      const url = new URL(info.map.trim());
      const allowed = ["map.naver.com", "m.map.naver.com", "naver.me"].includes(url.hostname);
      if (url.protocol === "https:" && allowed && !url.username && !url.password) return url.href;
    } catch {
      // Fall back to the address if the shared link is incomplete.
    }
  }
  const address = info.address.trim();
  return address ? "https://map.naver.com/p/search/" + encodeURIComponent(address) : "";
}

function officeText(info) {
  return [
    "세움부동산 방문 및 상담",
    info.address.trim() && "주소: " + info.address.trim(),
    info.directions.trim() && "찾아오는 길: " + info.directions.trim(),
    info.phone.trim() && "전화: " + info.phone.trim(),
    info.email.trim() && "이메일: " + info.email.trim(),
    mapLink(info) && "네이버지도: " + mapLink(info),
  ].filter(Boolean).join("\n");
}

function updateOfficeActions() {
  const link = mapLink(office);
  $("open-map").hidden = !link;
  if (link) $("open-map").href = link;
  else $("open-map").removeAttribute("href");
  $("insert-office").disabled = !Object.values(office).some((value) => value.trim());
  $("office-hint").textContent = office.map.trim() && !link.startsWith(office.map.trim())
    && link.startsWith("https://map.naver.com/p/search/")
    ? "공유 링크를 확인해 주세요. 현재는 도로명주소로 네이버지도를 엽니다."
    : "지도 링크를 비워 두면 도로명주소로 네이버지도를 엽니다.";
}

for (const key of Object.keys(officeDefaults)) {
  const input = $("office-" + key);
  input.value = office[key];
  input.addEventListener("input", () => {
    office[key] = input.value;
    updateOfficeActions();
    persist();
  });
}
updateOfficeActions();

$("insert-office").addEventListener("click", () => {
  const text = officeText(office);
  if (state.body.includes(text)) return toast("같은 방문 안내가 본문에 있습니다.");
  insertBody(text, true);
});

$("download-brand").addEventListener("click", async () => {
  try {
    const image = $("brand-image");
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    canvas.getContext("2d").drawImage(image, 0, 0);
    const png = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!png) throw new Error("PNG encoding failed");
    downloadFile(png, "세움부동산-브랜드.png");
  } catch {
    toast("이미지를 저장하지 못했습니다. 브라우저에서 이미지를 열고 다시 시도해 주세요.");
  }
});

$("download").addEventListener("click", () => {
  const text = [state.title, state.body, state.tags].filter(Boolean).join("\n\n");
  const name = state.title.replace(/[<>:"/\\|?*\u0000-\u001F]/g, "-").trim().slice(0, 90) || "세움-초안";
  downloadFile(new Blob(["\uFEFF", text], { type: "text/plain;charset=utf-8" }), name + ".txt");
});

function downloadFile(file, name) {
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function route() {
  const view = ["drafts", "guide", "card-news"].includes(location.hash.slice(1)) ? location.hash.slice(1) : "write";
  for (const section of all("main > section")) section.hidden = section.id !== "view-" + view;
  for (const link of all("[data-nav]")) {
    if (link.dataset.nav === view) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  }
  if (view === "drafts") renderDrafts();
}

buildChecks();
renderFields();
const cardNews = setupCardNews({
  getDraft: () => ({ title: state.title || state.topic, body: state.body || state.notes, tags: state.tags }),
  downloadFile,
  toast,
});
for (const button of all("[data-make-instagram]")) {
  button.addEventListener("click", () => {
    if (cardNews?.fromDraft()) location.hash = "card-news";
  });
}
route();
window.addEventListener("hashchange", () => {
  route();
  if (location.hash === "#card-news") $("card-news-title").focus();
});
