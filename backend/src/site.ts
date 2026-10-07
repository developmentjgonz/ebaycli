export const SITE_STYLES = `
:root {
  color-scheme: light;
  --paper: #f7f7f2;
  --white: #fff;
  --ink: #17292c;
  --muted: #536365;
  --line: #dce2dd;
  --nav: #182e31;
  --accent: #a43e26;
  --success: #21613f;
  --warning: #80531a;
  --error: #a02d35;
  --focus: #215da0;
}

* {
  box-sizing: border-box;
}

html {
  scroll-behavior: smooth;
  scroll-padding-top: 2rem;
}

body.site {
  margin: 0;
  max-width: none;
  padding: 0;
  background: var(--paper);
  color: var(--ink);
  font-family: -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
  font-size: 15px;
  line-height: 1.55;
}

button,input,select,textarea {
  font: inherit;
}

button,a,select {
  touch-action: manipulation;
}

button {
  cursor: pointer;
}

::selection {
  background: #d4e7dc;
  color: #163527;
}

a {
  color: inherit;
  text-decoration-thickness: 1px;
  text-underline-offset: 4px;
}

a:hover {
  text-decoration-thickness: 2px;
}

a:focus-visible,button:focus-visible,select:focus-visible,textarea:focus-visible {
  outline: 3px solid var(--focus);
  outline-offset: 4px;
}

button:disabled {
  cursor: wait;
  opacity: .65;
}

.shell {
  display: grid;
  grid-template-columns: 238px minmax(0,1fr);
  min-height: 100vh;
}

.sidebar {
  background: var(--nav);
  color: #e7efea;
  padding: 30px 22px;
  display: flex;
  flex-direction: column;
  gap: 40px;
}

.brand {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 22px;
  font-weight: 750;
  letter-spacing: -.03em;
  text-decoration: none;
}

.brand svg {
  width: 25px;
  height: 25px;
  flex: none;
  color: #afd3bc;
}

.sidebar small {
  display: block;
  margin: 9px 0 0 35px;
  color: #bdd0c9;
  font-size: 12px;
}

.nav {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.nav a {
  display: flex;
  gap: 11px;
  align-items: center;
  padding: 11px 12px;
  border-radius: 8px;
  text-decoration: none;
  font-size: 14px;
  color: #c7d8d1;
}

.nav a:hover {
  background: #244347;
  color: #fff;
}

.nav .active {
  background: #304c4d;
  color: #fff;
  font-weight: 650;
}

.nav svg {
  width: 18px;
  height: 18px;
  stroke: currentColor;
  fill: none;
  stroke-width: 1.6;
  flex: none;
}

.sidebar-foot {
  margin-top: auto;
  padding: 20px 12px 0;
  border-top: 1px solid #385052;
  font-size: 12px;
  color: #bdd0c9;
}

.sidebar-foot strong {
  display: block;
  color: #f1f6f1;
  font-weight: 600;
  margin-bottom: 5px;
}

.content {
  max-width: 1120px;
  width: 100%;
  margin: 0 auto;
  padding: 40px 56px 30px;
  min-width: 0;
}

.topline {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 36px;
  font-size: 13px;
  color: var(--muted);
}

.topline a {
  font-weight: 550;
}

.platform {
  display: flex;
  align-items: center;
  gap: 7px;
}

.platform svg {
  height: 18px;
  width: 18px;
  stroke: currentColor;
  fill: none;
  stroke-width: 1.6;
}

.page-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 28px;
  margin-bottom: 38px;
}

.page-head h1 {
  font-size: 34px;
  line-height: 1.15;
  letter-spacing: -.035em;
  margin: 0 0 12px;
  font-weight: 700;
  text-wrap: balance;
}

.page-head p {
  font-size: 16px;
  max-width: 58ch;
  margin: 0;
  color: var(--muted);
}

.button {
  border: 1px solid #c4cec7;
  background: var(--white);
  color: var(--ink);
  min-height: 42px;
  padding: 9px 15px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 650;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  white-space: nowrap;
  transition: background 160ms,border-color 160ms;
}

.button:hover {
  background: #edf2ed;
  border-color: #a0aea4;
}

.button:active {
  background: #e0e9e1;
}

.button svg {
  width: 16px;
  height: 16px;
  stroke: currentColor;
  fill: none;
  stroke-width: 1.7;
  flex: none;
}

.button-primary {
  background: var(--accent);
  color: #fff;
  border-color: transparent;
}

.button-primary:hover {
  background: #8b321d;
  border-color: transparent;
}

.button-primary:active {
  background: #742916;
}

.page-head>.button {
  margin-top: 3px;
}

.check-panel {
  background: var(--white);
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: 24px 28px;
  margin-bottom: 44px;
}

.section-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 20px;
  margin-bottom: 14px;
}

.section-head h2 {
  font-size: 20px;
  letter-spacing: -.02em;
  margin: 0;
  font-weight: 650;
  line-height: 1.25;
}

.check-summary {
  color: var(--muted);
  font-size: 14px;
  margin: 0 0 20px;
  max-width: 72ch;
}

.check-list {
  border-top: 1px solid var(--line);
}

.check-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  padding: 17px 0;
  border-bottom: 1px solid var(--line);
}

.check-row strong {
  font-weight: 650;
  display: block;
  font-size: 14px;
}

.check-row small {
  display: block;
  font-size: 12px;
  color: var(--muted);
  margin-top: 3px;
}

.status {
  font-size: 12px;
  font-weight: 650;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 9px;
  border-radius: 20px;
  background: #edf0ed;
  color: #52635c;
  white-space: nowrap;
}

.status:before {
  content: "";
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
}

.status[data-state=good] {
  background: #e5f2e9;
  color: var(--success);
}

.status[data-state=error] {
  background: #fbe9e9;
  color: var(--error);
}

.status[data-state=warning] {
  background: #fff0d7;
  color: var(--warning);
}

.check-foot {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  padding-top: 15px;
  color: var(--muted);
  font-size: 12px;
}

.check-foot a {
  white-space: nowrap;
}

.notice {
  margin: 16px 0 0;
  color: var(--error);
  font-size: 13px;
}

.note {
  font-size: 13px;
  color: var(--muted);
  max-width: 72ch;
}

.deployment-url {
  overflow-wrap: anywhere;
  font-family: ui-monospace,SFMono-Regular,Consolas,monospace;
  font-size: 12px;
  color: var(--muted);
}

.setup-head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 25px;
  margin-bottom: 24px;
}

.setup-head h2,.scope h2 {
  font-size: 24px;
  letter-spacing: -.025em;
  line-height: 1.2;
  margin: 0 0 9px;
  font-weight: 650;
}

.setup-head p {
  max-width: 64ch;
  margin: 0;
  color: var(--muted);
  font-size: 14px;
}

.field {
  flex: none;
}

.field label {
  display: block;
  font-size: 12px;
  font-weight: 650;
  margin-bottom: 6px;
}

.field select {
  border: 1px solid #bbc8c0;
  background: var(--white);
  border-radius: 8px;
  padding: 8px 33px 8px 12px;
  color: var(--ink);
  min-height: 40px;
  font-size: 13px;
  width: 160px;
}

.environment-note {
  margin: 0 0 26px;
  font-size: 13px;
  color: var(--muted);
}

.steps {
  list-style: none;
  margin: 0;
  padding: 0;
  counter-reset: steps;
}

.step {
  position: relative;
  display: grid;
  grid-template-columns: 31px minmax(0,1fr);
  gap: 17px;
  padding: 0 0 32px;
  margin: 0 0 29px;
  border-bottom: 1px solid var(--line);
  counter-increment: steps;
}

.step:before {
  content: counter(steps);
  font-variant-numeric: tabular-nums;
  border: 1px solid #b5c7b9;
  border-radius: 50%;
  width: 29px;
  height: 29px;
  display: grid;
  place-items: center;
  color: #315741;
  background: #eef4ec;
  font-weight: 650;
  font-size: 13px;
}

.step h3 {
  font-size: 17px;
  line-height: 1.3;
  letter-spacing: -.01em;
  font-weight: 650;
  margin: 3px 0 8px;
}

.step p {
  font-size: 14px;
  max-width: 72ch;
  color: var(--muted);
  margin: 0 0 14px;
}

.command {
  background: #1b3033;
  color: #edf5ee;
  border-radius: 9px;
  padding: 16px 18px;
  position: relative;
}

.command-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
  font-size: 11px;
  color: #b9cec4;
}

.copy-small {
  border: 1px solid #527069;
  background: transparent;
  color: #e5f1e8;
  border-radius: 5px;
  min-height: 30px;
  font-size: 11px;
  font-weight: 600;
  padding: 4px 9px;
}

.copy-small:hover {
  background: #2d4948;
}

.command pre {
  margin: 0;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  word-break: break-word;
  font-size: 12px;
  line-height: 1.85;
  font-family: ui-monospace,SFMono-Regular,Consolas,"Liberation Mono",monospace;
}

.command code {
  background: none;
  padding: 0;
  color: inherit;
  border-radius: 0;
  font-family: inherit;
}

.step .note {
  font-size: 12px;
  margin: 11px 0 0;
}

.scope {
  margin-top: 8px;
  padding-bottom: 34px;
  border-bottom: 1px solid var(--line);
}

.scope>p {
  color: var(--muted);
  font-size: 14px;
  max-width: 72ch;
  margin: 0 0 20px;
}

.scope-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 34px;
}

.scope-grid h3 {
  font-size: 13px;
  font-weight: 650;
  margin: 0 0 12px;
}

.scope-grid ul {
  list-style: none;
  padding: 0;
  margin: 0;
}

.scope-grid li {
  font-size: 13px;
  margin: 8px 0;
  padding-left: 19px;
  position: relative;
  color: var(--muted);
}

.scope-grid li:before {
  content: "";
  position: absolute;
  left: 0;
  top: .55em;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #6c8978;
}

.scope-grid .unavailable li:before {
  background: #8a9490;
}

.footer {
  font-size: 12px;
  color: var(--muted);
  display: flex;
  justify-content: space-between;
  gap: 20px;
  padding-top: 24px;
}

.footer-links {
  display: flex;
  gap: 20px;
}

.feedback {
  min-height: 21px;
  font-size: 12px;
  color: var(--success);
  margin: 0 0 12px;
}

.copy-fallback {
  margin: 0 0 28px;
}

.copy-fallback[hidden] {
  display: none;
}

.copy-fallback label {
  display: block;
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 7px;
}

.copy-fallback textarea {
  display: block;
  resize: vertical;
  min-height: 160px;
  width: 100%;
  padding: 12px;
  border: 1px solid #bbc8c0;
  border-radius: 8px;
  background: #fff;
  color: var(--ink);
  font-size: 12px;
  line-height: 1.6;
  font-family: ui-monospace,SFMono-Regular,Consolas,monospace;
}

.skip-link {
  position: absolute;
  left: 14px;
  top: -100px;
  background: #fff;
  color: var(--ink);
  padding: 10px 14px;
  z-index: 5;
}

.skip-link:focus {
  top: 12px;
}

.noscript {
  background: #fff0d7;
  color: var(--warning);
  font-size: 13px;
  padding: 12px;
  border-radius: 8px;
  margin-bottom: 22px;
}

@media(max-width:1100px) {
  .content {
    padding: 32px 35px;
  }
  .shell {
    grid-template-columns: 210px minmax(0,1fr);
  }
  .page-head {
    display: block;
  }
  .page-head>.button {
    margin-top: 20px;
  }
  .sidebar {
    padding: 28px 18px;
  }
  .brand {
    font-size: 21px;
  }
}

@media(max-width:760px) {
  .shell {
    display: block;
  }
  .sidebar {
    padding: 17px 20px;
    gap: 16px;
  }
  .brand {
    font-size: 20px;
  }
  .brand svg {
    width: 22px;
    height: 22px;
  }
  .sidebar small,.sidebar-foot {
    display: none;
  }
  .nav {
    flex-direction: row;
    gap: 5px;
    flex-wrap: wrap;
  }
  .nav a {
    padding: 7px 9px;
    font-size: 12px;
  }
  .nav a svg {
    display: none;
  }
  .nav a.external-nav {
    display: none;
  }
  .content {
    padding: 25px 20px;
  }
  .topline {
    margin-bottom: 25px;
    font-size: 12px;
  }
  .page-head {
    margin-bottom: 27px;
  }
  .page-head h1 {
    font-size: 29px;
  }
  .page-head p {
    font-size: 15px;
  }
  .page-head>.button {
    width: 100%;
    margin-top: 19px;
  }
  .check-panel {
    padding: 20px 18px;
    margin-bottom: 32px;
  }
  .section-head {
    align-items: flex-start;
    gap: 12px;
  }
  .section-head h2 {
    font-size: 18px;
    padding-top: 6px;
  }
  .section-head .button {
    min-height: 36px;
    padding: 7px 10px;
    font-size: 12px;
  }
  .check-summary {
    font-size: 13px;
  }
  .check-row {
    gap: 12px;
  }
  .check-row small {
    max-width: 24ch;
  }
  .check-foot {
    display: block;
  }
  .check-foot span {
    display: block;
  }
  .check-foot a {
    display: block;
    width: fit-content;
    margin-top: 10px;
  }
  .setup-head {
    display: block;
  }
  .setup-head h2,.scope h2 {
    font-size: 22px;
  }
  .field {
    margin-top: 18px;
  }
  .field select {
    width: 100%;
  }
  .step {
    grid-template-columns: 25px minmax(0,1fr);
    gap: 12px;
    padding-bottom: 25px;
    margin-bottom: 25px;
  }
  .step:before {
    width: 25px;
    height: 25px;
    font-size: 12px;
  }
  .step h3 {
    font-size: 16px;
  }
  .step p {
    font-size: 13px;
  }
  .command {
    padding: 13px 14px;
  }
  .command pre {
    font-size: 11px;
    line-height: 1.8;
  }
  .scope-grid {
    grid-template-columns: 1fr;
    gap: 22px;
  }
  .footer {
    flex-direction: column;
    gap: 12px;
  }
  .deployment-url {
    font-size: 11px;
  }
}

@media(prefers-reduced-motion:reduce) {
  html {
    scroll-behavior: auto;
  }
  * {
    transition: none!important;
  }
}
`;

export const SITE_SCRIPT = String.raw`(() => {
  'use strict';
  const root = document.querySelector('[data-relay-origin]');
  const origin = root.dataset.relayOrigin;
  const environment = document.getElementById('environment');
  const retry = document.getElementById('retry-checks');
  const feedback = document.getElementById('copy-feedback');
  let available = [];
  let checked = false;
  const profile = () => environment.value === 'sandbox' ? 'sandbox' : 'own-store';
  const cli = () => 'node /workspace/ebaycli/cli/dist/index.js --profile ' + profile();
  function syncCommands() {
    document.getElementById('connect-command').textContent = cli() + ' config set --backend-url ' + origin + ' --json\n' + cli() + ' auth login --environment ' + environment.value + ' --no-open --timeout-seconds 600 --json';
    document.getElementById('store-command').textContent = cli() + ' status --json\n' + cli() + ' listings list --limit 5 --json';
    const note = document.getElementById('environment-note');
    note.textContent = !checked ? 'Checking which environments this relay has configured…' : available.includes(environment.value) ? (environment.value === 'sandbox' ? 'Sandbox' : 'Production') + ' is configured for login. Live eBay consent still needs your verification.' : (environment.value === 'sandbox' ? 'Sandbox' : 'Production') + ' is not ready for login. Complete the relay configuration and check again.';
  }
  function botInstructions() {
    return 'Help manage my own eBay store with ebaycli on your cloud computer.\n\nUse /workspace/ebaycli for the checkout. If it is not there, run:\ngit clone --branch main https://github.com/developmentjgonz/ebaycli.git /workspace/ebaycli\n\nIf the checkout already exists, inspect its branch and local changes before switching to main; do not overwrite existing work. Use a current Node.js 22+ release. Run:\n' + document.getElementById('install-command').textContent + '\n\nConnect using these commands:\n' + document.getElementById('connect-command').textContent + '\n\nKeep the login command running. Open its consent URL in your cloud browser on that same computer, and ask me to take over for my eBay sign-in, verification, and consent. Never ask me to paste passwords, tokens, or profile-file contents into chat. Do not bypass verification.\n\nAfter login, run:\n' + document.getElementById('store-command').textContent + '\n' + cli() + ' guide agent-notes --json\n\nUse the selected ' + profile() + ' profile consistently. Keep tokens in the CLI config file, never in messages or shared artifacts. Read listings and prepare create/update/end plans. Show me the target and changes before applying them unless I have given a specific standing authorization. Policy creation, program opt-in, and location creation/update act immediately, so get authorization for those too. Do not promise orders, refunds, buyer messages, or other workflows absent from the CLI. Serialize operations that save this profile.';
  }
  async function copy(text, button) {
    const label = button.querySelector('span') || button;
    const original = label.textContent;
    try {
      if (!navigator.clipboard || !navigator.clipboard.writeText) throw new Error('clipboard unavailable');
      await navigator.clipboard.writeText(text);
      label.textContent = 'Copied';
      feedback.textContent = 'Copied. You can paste this into your Grok Bot conversation.';
      document.getElementById('copy-fallback').hidden = true;
      window.setTimeout(() => { label.textContent = original; }, 2200);
    } catch {
      const fallback = document.getElementById('copy-fallback');
      const area = document.getElementById('copy-text');
      fallback.hidden = false;
      area.value = text;
      area.focus();
      area.select();
      feedback.textContent = 'Clipboard access is unavailable. The text below is selected; use your device’s Copy action.';
    }
  }
  document.querySelectorAll('[data-copy-target]').forEach(button => button.addEventListener('click', () => copy(document.getElementById(button.dataset.copyTarget).textContent, button)));
  document.getElementById('copy-handoff').addEventListener('click', event => copy(botInstructions(), event.currentTarget));
  environment.addEventListener('change', syncCommands);
  function badge(id, good, label) {
    const node = document.getElementById(id);
    node.dataset.state = good ? 'good' : 'error';
    node.textContent = label;
  }
  async function readCheck(path) {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch(path, { cache: 'no-store', credentials: 'omit', signal: controller.signal });
      const body = await response.json();
      return { ok: response.ok, body };
    } catch { return { ok: false, body: { detail: 'The check could not reach this relay. Check your connection and try again.' } }; }
    finally { window.clearTimeout(timeout); }
  }
  async function check() {
    retry.disabled = true;
    retry.textContent = 'Checking…';
    document.getElementById('check-summary').textContent = 'Checking the live service and OAuth configuration…';
    for (const id of ['health-status', 'ready-status', 'access-status']) { const node = document.getElementById(id); node.dataset.state = 'pending'; node.textContent = 'Checking'; }
    const [health, ready] = await Promise.all([readCheck('/health'), readCheck('/ready')]);
    const live = health.ok && health.body.status === 'ok';
    const prepared = ready.ok && ready.body.status === 'ready';
    badge('health-status', live, live ? 'Online' : 'Unreachable');
    badge('ready-status', prepared, prepared ? 'Configured' : 'Needs setup');
    const access = document.getElementById('access-status');
    access.dataset.state = prepared && ready.body.sellerAccessMode === 'restricted' ? 'good' : prepared && ready.body.sellerAccessMode === 'open' ? 'warning' : 'error';
    access.textContent = prepared && ready.body.sellerAccessMode === 'restricted' ? 'Restricted' : prepared && ready.body.sellerAccessMode === 'open' ? 'Open' : 'Needs setup';
    available = prepared && Array.isArray(ready.body.configuredEnvironments) ? ready.body.configuredEnvironments.filter(value => ['production','sandbox'].includes(value)) : [];
    checked = true;
    document.getElementById('check-summary').textContent = live && prepared ? 'The relay is online and configured for ' + available.join(' and ') + '. Connect your CLI next; this check does not confirm a seller account.' : !live ? 'The service check failed. Check your connection and retry before starting login.' : typeof ready.body.detail === 'string' ? ready.body.detail : 'The relay is online, but OAuth configuration needs attention. Follow the deployment guide, then check again.';
    const now = new Date();
    const time = document.getElementById('last-checked');
    time.dateTime = now.toISOString();
    time.textContent = 'Checked ' + now.toLocaleTimeString([], { hour:'numeric', minute:'2-digit' });
    retry.disabled = false;
    retry.textContent = 'Check again';
    syncCommands();
  }
  retry.addEventListener('click', check);
  syncCommands();
  check();
})();`;
