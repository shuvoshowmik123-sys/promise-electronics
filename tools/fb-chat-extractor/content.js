// ============================================================
// Promise Chat Extractor — Content Script
// Runs on business.facebook.com
// NO confirms, NO alerts — fully silent automatic extraction
// ============================================================

const delay = ms => new Promise(r => setTimeout(r, ms));

let STOP = false;

function progress(text) {
  chrome.runtime.sendMessage({ action: 'PROGRESS', text });
}

// ── Find conversation list items in left panel ──────────────────────
function getConversationItems() {
  // Meta Business Suite left panel: each thread is a clickable row
  const selectors = [
    '[role="row"]',
    '[data-scope="conversation_list_item"]',
    '[class*="ConversationListItem"]',
    '[aria-label*="conversation"]',
  ];
  for (const sel of selectors) {
    const els = [...document.querySelectorAll(sel)];
    if (els.length > 2) return els;
  }
  // Fallback: find left-panel clickable divs that look like conversation rows
  // They typically have a name and a preview message
  const allDivs = [...document.querySelectorAll('div[tabindex="0"], li[tabindex="0"]')];
  return allDivs.filter(el => {
    const t = el.innerText?.trim();
    return t && t.length > 3 && t.length < 200 && el.getBoundingClientRect().width > 50;
  }).slice(0, 200);
}

// ── Find scrollable message container ──────────────────────────────
function findMsgContainer() {
  return document.querySelector('[role="log"]') ||
         document.querySelector('[aria-label="Messages"]') ||
         [...document.querySelectorAll('div')].filter(d =>
           d.scrollHeight > 400 &&
           d.scrollHeight > d.clientHeight * 1.4 &&
           d.clientHeight > 200 &&
           d.clientHeight < window.innerHeight
         ).sort((a, b) => b.scrollHeight - a.scrollHeight)[0];
}

// ── Extract messages from currently open conversation ───────────────
async function extractCurrentConversation() {
  // Scroll to top to load older messages
  const container = findMsgContainer();
  if (!container) return [];

  const cRect = container.getBoundingClientRect();
  const midX  = cRect.left + cRect.width * 0.55; // slight right bias for "our" messages

  let prevH = 0, stuckCount = 0;
  for (let i = 0; i < 30; i++) {
    if (STOP) break;
    container.scrollTop = 0;
    await delay(800);
    const h = container.scrollHeight;
    if (h === prevH) { stuckCount++; if (stuckCount >= 3) break; }
    else stuckCount = 0;
    prevH = h;
  }

  // Walk DOM for message bubbles
  const seenTexts = new Set();
  const messages  = [];

  const walker = document.createTreeWalker(container, NodeFilter.SHOW_ELEMENT);
  const candidates = [];
  let node;
  while ((node = walker.nextNode())) {
    const tag = node.tagName?.toLowerCase();
    if (!['div','span','p'].includes(tag)) continue;
    const text = node.innerText?.trim();
    if (!text || text.length < 2 || text.length > 1500) continue;
    const bigKids = [...node.children].filter(c => (c.innerText?.trim().length || 0) > 20);
    if (bigKids.length > 2) continue;
    candidates.push(node);
  }

  candidates.forEach(el => {
    const text = el.innerText?.trim();
    if (!text || seenTexts.has(text)) return;
    const isNested = candidates.some(o => o !== el && o.contains(el) && o.innerText?.trim() === text);
    if (isNested) return;
    seenTexts.add(text);
    const rect   = el.getBoundingClientRect();
    const center = rect.left + rect.width / 2;
    messages.push({ role: center > midX ? 'assistant' : 'user', content: text });
  });

  return messages;
}

// ── Build Q&A pairs from sequential messages ────────────────────────
function buildPairs(messages, conversationName) {
  const pairs = [];
  for (let i = 0; i < messages.length - 1; i++) {
    if (messages[i].role === 'user' && messages[i + 1].role === 'assistant') {
      pairs.push({
        customerMessage: messages[i].content,
        ourReply:        messages[i + 1].content,
        isGoodExample:   true,
        source:          'facebook_page_' + conversationName,
      });
    }
  }
  return pairs;
}

// ── Get name/label of current open conversation ─────────────────────
function getCurrentConversationName() {
  // Usually shown in the header of the chat panel
  const headerSels = ['[aria-label*="conversation"] h1', '[role="banner"] span', 'header span'];
  for (const sel of headerSels) {
    const el = document.querySelector(sel);
    if (el?.innerText?.trim()) return el.innerText.trim().slice(0, 60);
  }
  return 'unknown_' + Date.now();
}

// ── MAIN EXTRACTION LOOP ────────────────────────────────────────────
async function runExtraction() {
  STOP = false;
  const allConversations = [];
  const allPairs         = [];

  progress('Scanning conversation list...');
  await delay(1000);

  const items = getConversationItems();
  if (!items.length) {
    return { done: false, error: 'Cannot find conversation list. Open inbox at business.facebook.com/latest/inbox/all' };
  }

  progress(`Found ${items.length} conversations. Starting...`);

  for (let i = 0; i < items.length; i++) {
    if (STOP) break;

    const item = items[i];
    try {
      // Click the conversation
      item.click();
      await delay(1500); // wait for chat to load

      const name     = getCurrentConversationName();
      const messages = await extractCurrentConversation();
      const pairs    = buildPairs(messages, name);

      if (messages.length > 0) {
        allConversations.push({ name, messageCount: messages.length, pairCount: pairs.length, messages });
        allPairs.push(...pairs);
      }

      progress(`[${i + 1}/${items.length}] ${name}\n${messages.length} messages, ${pairs.length} pairs\n\nTotal pairs so far: ${allPairs.length}`);
    } catch (e) {
      // Skip failed conversations silently — never stop the loop
      progress(`[${i + 1}/${items.length}] Skipped (error)\n\nTotal pairs so far: ${allPairs.length}`);
    }

    await delay(600);
  }

  const output = {
    extractedAt:       new Date().toISOString(),
    totalConversations: allConversations.length,
    totalPairs:        allPairs.length,
    conversations:     allConversations,
    conversationPairs: allPairs,
  };

  return {
    done:  true,
    data:  output,
    stats: { conversations: allConversations.length, pairs: allPairs.length },
  };
}

// ── Message listener (from popup) ──────────────────────────────────
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.action === 'START_EXTRACTION') {
    runExtraction().then(sendResponse).catch(e => sendResponse({ done: false, error: e.message }));
    return true; // async response
  }
  if (msg.action === 'STOP_EXTRACTION') {
    STOP = true;
    sendResponse({ ok: true });
  }
});
