/* Shared behaviour for the three Due design previews. Mock data only: nothing
   here talks to Stellar. Real hashes and addresses come from docs/evidence.md. */
(() => {
  const PAYER = "GC3C…IU4V";
  const DUES = {
    2: { id: 2, serial: "0002", ref: "invoice 19", amount: "10", status: "open", expired: false,
         recipient: "GB3M…H2VK", deadline: "21 Oct 2026, 11:43", left: "13 days left", payer: "", tx: "" },
    3: { id: 3, serial: "0003", ref: "invoice 20 test", amount: "10", status: "paid", expired: false,
         recipient: "GB3M…H2VK", deadline: "21 Oct 2026, 11:43", left: "13 days left",
         payer: PAYER, tx: "ed17cf2a…c373" },
    4: { id: 4, serial: "0004", ref: "invoice 21 expiring", amount: "10", status: "open", expired: true,
         recipient: "GB3M…H2VK", deadline: "7 Oct 2026, 16:51", left: "passed", payer: "", tx: "" },
    5: { id: 5, serial: "0005", ref: "invoice 22", amount: "10", status: "open", expired: false,
         recipient: "GB3M…H2VK", deadline: "28 Oct 2026, 14:03", left: "21 days left", payer: "", tx: "" },
  };
  const WRONG = { label: "Pay 9 USDC", ok: false, err: "WrongAmount", tx: "98df0db4…eb81" };

  let cur = 2, connected = false, busy = "", finding = false, attempts = 0;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function stateOf(d) {
    if (d.status === "paid") return "paid";
    if (d.status === "closed") return "closed";
    return d.expired ? "expired" : "open";
  }

  function render() {
    const d = DUES[cur];
    const b = document.body;
    b.dataset.state = stateOf(d);
    b.dataset.wallet = connected ? "on" : "off";
    b.dataset.busy = busy;
    b.dataset.finding = finding ? "yes" : "no";
    b.dataset.attempts = String(attempts);
    $$("[data-f]").forEach((el) => { el.textContent = d[el.dataset.f] ?? ""; });
    $$("[data-wallet-addr]").forEach((el) => { el.textContent = PAYER; });
    $$(".js-pay-label").forEach((el) => {
      el.textContent = busy === "wallet" ? "Waiting for the wallet…"
        : busy === "ledger" ? "Waiting for the ledger…" : "Pay 10 USDC";
    });
    $$(".js-next-label").forEach((el) => { el.textContent = finding ? "Looking…" : "Show next open due"; });
    $$(".needs-wallet").forEach((el) => { el.disabled = !connected || !!busy; });
    $$(".js-next").forEach((el) => { el.disabled = finding; });
  }

  function addAttempt(a) {
    const tpl = $("#tpl-attempt");
    const host = $("#attempts");
    if (!tpl || !host) return;
    const node = tpl.content.firstElementChild.cloneNode(true);
    node.dataset.ok = a.ok ? "yes" : "no";
    $$("[data-slot]", node).forEach((el) => {
      const k = el.dataset.slot;
      el.textContent = k === "label" ? a.label : k === "badge" ? (a.ok ? "Succeeded" : a.err) : a.tx;
    });
    host.prepend(node);
    attempts += 1;
  }

  async function run(label, done) {
    busy = "wallet"; render(); await sleep(1100);
    busy = "ledger"; render(); await sleep(1300);
    busy = ""; done(); render();
  }

  const actions = {
    connect() { connected = true; },
    disconnect() { connected = false; },
    pay() {
      run("pay", () => {
        const d = DUES[cur];
        d.status = "paid"; d.payer = PAYER; d.tx = "ed17cf2a…c373";
        addAttempt({ label: "Pay 10 USDC", ok: true, tx: d.tx });
      });
    },
    wrong() { run("wrong", () => addAttempt(WRONG)); },
    close() { run("close", () => { DUES[cur].status = "closed"; }); },
    async next() {
      finding = true; render(); await sleep(700);
      const open = Object.values(DUES).filter((d) => d.status === "open" && !d.expired).map((d) => d.id);
      const after = open.find((id) => id > cur);
      cur = after ?? open[0] ?? cur; finding = false; render();
    },
    copy(el) {
      const old = el.textContent; el.textContent = "Copied";
      setTimeout(() => { el.textContent = old; }, 1200);
    },
  };

  document.addEventListener("click", (e) => {
    const el = e.target.closest("[data-act]");
    if (!el || el.disabled) return;
    const fn = actions[el.dataset.act];
    if (fn) { e.preventDefault(); fn(el); render(); }
  });

  function preview() {
    const bar = document.createElement("div");
    bar.setAttribute("role", "toolbar");
    bar.setAttribute("aria-label", "Preview state");
    bar.style.cssText = "position:fixed;z-index:99;left:50%;bottom:12px;transform:translateX(-50%);display:flex;gap:2px;padding:3px;border-radius:999px;background:#111;font:12px/1 system-ui,sans-serif;box-shadow:0 4px 18px rgba(0,0,0,.35)";
    [["Open", 2], ["Paid", 3], ["Expired", 4]].forEach(([name, id]) => {
      const b = document.createElement("button");
      b.textContent = name;
      b.style.cssText = "all:unset;cursor:pointer;color:#fff;padding:7px 12px;border-radius:999px;font:inherit";
      b.onmouseenter = () => (b.style.background = "#333");
      b.onmouseleave = () => (b.style.background = "");
      b.onclick = () => { cur = id; render(); };
      bar.appendChild(b);
    });
    document.body.appendChild(bar);
  }

  window.addEventListener("DOMContentLoaded", () => {
    preview();
    const tokens = location.hash.slice(1).split("+");
    if (tokens.includes("paid")) cur = 3;
    if (tokens.includes("expired")) cur = 4;
    if (tokens.includes("connected") || tokens.includes("refused")) connected = true;
    if (tokens.includes("refused")) addAttempt(WRONG);
    render();
  });
})();
