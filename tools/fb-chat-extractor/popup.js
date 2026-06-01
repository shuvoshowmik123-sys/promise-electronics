const btnStart    = document.getElementById('btnStart');
const btnStop     = document.getElementById('btnStop');
const btnDownload = document.getElementById('btnDownload');
const statusEl    = document.getElementById('status');

let extractedData = null;

function log(msg) {
  statusEl.textContent = msg;
}

// Send message to content script in active tab
async function sendToContent(action, payload = {}) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return chrome.tabs.sendMessage(tab.id, { action, ...payload });
}

btnStart.addEventListener('click', async () => {
  btnStart.style.display  = 'none';
  btnStop.style.display   = 'block';
  btnDownload.style.display = 'none';
  log('Starting extraction...\nDo not close this tab.');

  try {
    const result = await sendToContent('START_EXTRACTION');
    if (result?.done) {
      extractedData = result.data;
      log(`Done!\n${result.stats.conversations} conversations\n${result.stats.pairs} Q&A pairs\n\nClick Download to save.`);
      btnDownload.style.display = 'block';
    } else {
      log('Error: ' + (result?.error || 'Unknown'));
    }
  } catch (e) {
    log('Error: ' + e.message + '\n\nMake sure you are on business.facebook.com inbox.');
  }

  btnStop.style.display  = 'none';
  btnStart.style.display = 'block';
});

btnStop.addEventListener('click', async () => {
  await sendToContent('STOP_EXTRACTION').catch(() => {});
  btnStop.style.display  = 'none';
  btnStart.style.display = 'block';
  log('Stopped by user.');
});

btnDownload.addEventListener('click', () => {
  if (!extractedData) return;
  const blob = new Blob([JSON.stringify(extractedData, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `promise_chats_${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
});

// Listen for progress updates from content script
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.action === 'PROGRESS') {
    log(msg.text);
  }
});
