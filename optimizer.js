// App Store Keyword Optimizer — browser-only, no API.

const STOP_WORDS = new Set([
  "a","an","the","and","or","but","in","on","at","to","for","of","with","by","from",
  "is","are","was","were","be","been","being","have","has","had","do","does","did",
  "will","would","could","should","may","might","can","shall","must","need","dare",
  "this","that","these","those","it","its","they","them","their","we","our","you","your",
  "i","my","he","she","his","her","me","us","him","who","which","what","when","where",
  "how","why","if","then","so","as","up","out","all","not","just","more","also","new",
  "app","apps","apple","iphone","ipad","ios","get","use","using","used","make","makes",
  "made","help","helps","helping","best","free","now","here","there","any","some","one",
  "two","three","day","days","time","way","ways","even","much","many","like","into",
  "good","great","easy","simple","fast","quick","smart","over","about","after","before",
  "while","through","between","each","every","only","very","too","most","other","same",
  "set","put","take","see","look","keep","add","want","let","try","turn","go","come",
  "well","back","right","long","big","own","little","never","always","still","though",
  "both","few","more","such","sure","really","want","needs","need","than","things",
]);

const KEYWORD_LIMIT = 100;

function tokenize(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .map(t => t.replace(/^-+|-+$/g, "").trim())
    .filter(t => t.length >= 3 && !STOP_WORDS.has(t) && !/^\d+$/.test(t));
}

function stemSimple(word) {
  // Very light stemming: strip common suffixes for dedup
  return word
    .replace(/ing$/, "")
    .replace(/tion$/, "t")
    .replace(/ness$/, "")
    .replace(/ful$/, "")
    .replace(/able$/, "")
    .replace(/ible$/, "")
    .replace(/er$/, "")
    .replace(/est$/, "")
    .replace(/ly$/, "")
    .replace(/s$/, "");
}

function areSimilar(a, b) {
  if (a === b) return true;
  if (a.includes(b) || b.includes(a)) return true;
  if (stemSimple(a) === stemSimple(b)) return true;
  return false;
}

function dedupeTerms(terms) {
  const out = [];
  for (const t of terms) {
    if (!out.some(u => areSimilar(u, t))) out.push(t);
  }
  return out;
}

function titleTerms(title) {
  if (!title.trim()) return new Set();
  return new Set(tokenize(title));
}

function scoreKeyword(kw, descFreq) {
  const freq = descFreq.get(kw) || 0;
  const lenBonus = kw.length >= 5 ? 1.2 : 1;
  return freq * lenBonus;
}

function optimize() {
  const kwRaw   = document.getElementById("keywords").value;
  const title   = document.getElementById("appTitle").value;
  const desc    = document.getElementById("description").value;

  const issues  = [];
  const titleSet = titleTerms(title);

  // ── Parse current keywords ────────────────────────────────────────────────
  const kwTerms = kwRaw.split(",").map(t => t.trim().toLowerCase()).filter(Boolean);
  const charCount = kwRaw.length;

  if (charCount > 100) {
    issues.push({ level: "err", msg: `Keyword field is ${charCount} characters — ${charCount - 100} over the 100-character limit. Apple will truncate or reject it.` });
  } else if (charCount > 90) {
    issues.push({ level: "warn", msg: `${charCount}/100 characters used. You have ${100 - charCount} chars left — consider squeezing in one more term.` });
  }

  // Duplicates
  const seen = new Map();
  for (const t of kwTerms) {
    seen.set(t, (seen.get(t) || 0) + 1);
  }
  const dupes = [...seen.entries()].filter(([, n]) => n > 1).map(([t]) => t);
  if (dupes.length) {
    issues.push({ level: "warn", msg: `Duplicate keywords: ${dupes.join(", ")}. Each duplicate wastes space Apple charges you for.` });
  }

  // Singular/plural overlap
  const spOverlap = kwTerms.filter((t, _, arr) =>
    arr.includes(t + "s") || (t.endsWith("s") && arr.includes(t.slice(0, -1)))
  );
  if (spOverlap.length) {
    issues.push({ level: "warn", msg: `Singular/plural overlap: ${[...new Set(spOverlap)].join(", ")}. Apple searches cover both — you're wasting one slot.` });
  }

  // Terms already in title/subtitle
  const titleOverlap = kwTerms.filter(t => titleSet.has(t));
  if (titleOverlap.length) {
    issues.push({ level: "warn", msg: `Already in name/subtitle: ${titleOverlap.join(", ")}. Apple indexes these automatically — free up the space.` });
  }

  // Spaces (should use commas only, spaces count against limit)
  if (kwRaw.includes(" ")) {
    issues.push({ level: "warn", msg: "Spaces in keyword field count against your 100-char limit. Use commas with no spaces between terms (e.g. habit,tracker,goals)." });
  }

  if (!issues.length) {
    issues.push({ level: "ok", msg: "No structural issues found. Use the suggestions below to find missing terms." });
  }

  // ── Build optimized string ────────────────────────────────────────────────
  const descTokens = tokenize(desc);
  const descFreq   = new Map();
  for (const t of descTokens) descFreq.set(t, (descFreq.get(t) || 0) + 1);

  // Combine current terms + high-freq desc terms, dedup, remove title overlap
  const allCandidates = dedupeTerms([
    ...kwTerms,
    ...[...descFreq.entries()].filter(([, n]) => n >= 2).map(([t]) => t),
  ]).filter(t => !titleSet.has(t) && t.length >= 3);

  // Sort by score
  allCandidates.sort((a, b) => scoreKeyword(b, descFreq) - scoreKeyword(a, descFreq));

  // Build string within 100 chars
  const picked = [];
  let budget = KEYWORD_LIMIT;
  for (const t of allCandidates) {
    const cost = t.length + (picked.length > 0 ? 1 : 0); // +1 for comma
    if (cost <= budget) { picked.push(t); budget -= cost; }
    if (budget <= 0) break;
  }
  const optimized = picked.join(",");

  // ── Suggestions from description ─────────────────────────────────────────
  const currentSet = new Set(kwTerms);
  const suggestions = [...descFreq.entries()]
    .filter(([t, n]) => n >= 2 && !currentSet.has(t) && !titleSet.has(t) && t.length >= 4)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 24)
    .map(([t]) => t);

  // ── Render ────────────────────────────────────────────────────────────────
  const issueList = document.getElementById("issueList");
  issueList.innerHTML = issues.map(({ level, msg }) =>
    `<li><span class="pill ${level}">${level.toUpperCase()}</span><span>${msg}</span></li>`
  ).join("");

  const box = document.getElementById("optimizedBox");
  box.textContent = optimized;
  document.getElementById("optimizedCount").textContent = `${optimized.length}/100 characters`;

  const suggestTags = document.getElementById("suggestTags");
  if (suggestions.length) {
    suggestTags.innerHTML = suggestions.map(s =>
      `<span class="tag suggestion" onclick="addKeyword('${s}')">${s}</span>`
    ).join("");
    document.getElementById("suggestSection").style.display = "";
  } else {
    document.getElementById("suggestSection").style.display = "none";
  }

  const output = document.getElementById("output");
  output.classList.add("visible");
  output.scrollIntoView({ behavior: "smooth", block: "start" });
}

function addKeyword(term) {
  const kw = document.getElementById("keywords");
  const current = kw.value.trim();
  const terms = current ? current.split(",").map(t => t.trim()) : [];
  if (terms.includes(term)) return;
  const candidate = current ? `${current},${term}` : term;
  if (candidate.length > 100) {
    // Find and remove the suggestion tag so user knows it won't fit
    document.querySelectorAll(".tag.suggestion").forEach(el => {
      if (el.textContent === term) {
        el.style.opacity = "0.4";
        el.title = "Would exceed 100 chars";
        el.onclick = null;
      }
    });
    return;
  }
  kw.value = candidate;
  updateCharBar();
  // Re-run to update issues live
  optimize();
}
