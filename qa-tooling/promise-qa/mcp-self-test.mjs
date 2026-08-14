import assert from "node:assert/strict";
import http from "node:http";
import { PromiseQaDriver } from "./lib/promise-qa-driver.mjs";

const pageHtml = `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>Promise QA observer self-test</title>
  <style>
    html, body { margin: 0; font-family: sans-serif; }
    #wide { width: calc(100vw + 64px); height: 42px; background: #ddd; }
    #jitter { margin: 20px; }
    #covered { position: fixed; top: 140px; left: 24px; width: 180px; height: 44px; }
    #cover { position: fixed; z-index: 10; top: 138px; left: 22px; width: 184px; height: 48px; background: rgba(0,0,0,.2); }
    #scroll { width: 320px; height: 180px; overflow-y: auto; margin: 210px 20px 20px; border: 1px solid #222; }
    #scroll-content { height: 1400px; }
    #safe { margin: 20px; }
  </style>
</head>
<body>
  <div id="wide"></div>
  <button id="jitter">Jitter action</button>
  <button id="covered">Covered action</button>
  <div id="cover"></div>
  <div id="scroll"><div id="scroll-content">Scrollable content</div></div>
  <label>Search <input aria-label="Search" /></label>
  <button id="safe">Safe action</button>
  <script>
    let offset = false;
    setInterval(() => {
      offset = !offset;
      document.querySelector('#jitter').style.marginLeft = offset ? '44px' : '20px';
    }, 150);
    document.querySelector('#safe').addEventListener('click', () => document.body.dataset.safePressed = 'yes');
  </script>
</body>
</html>`;

const server = http.createServer((_request, response) => {
  response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  response.end(pageHtml);
});

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const address = server.address();
const baseUrl = `http://127.0.0.1:${address.port}`;
const driver = new PromiseQaDriver({ baseUrl, headless: true, allowedHosts: "127.0.0.1" });

try {
  const opened = await driver.open({ session: "self-test", profile: "desktop", url: "/" });
  assert.equal(opened.status, "OK");

  await new Promise((resolve) => setTimeout(resolve, 2600));
  await driver.check({ session: "self-test" });
  const anomalies = driver.anomalies({ session: "self-test", after: 0, limit: 200 });
  const codes = new Set(anomalies.anomalies.map((issue) => issue.code));
  assert.ok(codes.has("HORIZONTAL_OVERFLOW"), "horizontal overflow was not detected");
  assert.ok(codes.has("ACTION_OCCLUDED"), "action occlusion was not detected");
  assert.ok(codes.has("LAYOUT_JITTER"), "layout jitter was not detected");

  const pressed = await driver.press({ session: "self-test", target: "Safe action" });
  assert.equal(pressed.action, "press");
  const typed = await driver.type({ session: "self-test", target: "Search", text: "JOB-2026-0001" });
  assert.equal(typed.characters, 13);
  const scroll = await driver.scrollToEnd({ session: "self-test", direction: "down", maxGestures: 18 });
  assert.equal(scroll.reached, true);

  const report = driver.report();
  assert.equal(report.screenshotsCaptured, 0);
  assert.equal(report.imagesSentToModel, 0);
  assert.equal(report.verdict, "FAIL");
  console.log(`[PromiseQA] self-test PASS ${JSON.stringify({ detected: [...codes].sort(), scrollGestures: scroll.gestures })}`);
} finally {
  await driver.close().catch(() => {});
  await new Promise((resolve) => server.close(resolve));
}
