"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  CIRCLE_FAUCET,
  CONTRACT_ID,
  NETWORK_PASSPHRASE,
  SEEDED_DUE_ID,
  accountUrl,
  contractUrl,
  txUrl,
} from "@/lib/config";
import {
  STROOPS,
  addUsdcTrustline,
  close,
  findNextOpenDue,
  formatUsdc,
  fundWithFriendbot,
  getDue,
  getReadiness,
  hasUsdcTrustline,
  isContractError,
  pay,
  payWrongAmountOnLedger,
  shortAddr,
  type DueRecord,
  type Readiness,
  type TxOutcome,
} from "@/lib/due";
import { cn } from "@/lib/utils";
import { connect, disconnect, sign, walletPassphrase } from "@/lib/wallet";

type Busy = null | "prepare" | "wallet" | "ledger";
type Attempt = {
  key: number;
  label: string;
  outcome: TxOutcome;
};

const heroPill =
  "h-auto rounded-full border-[1.5px] border-white/50 bg-transparent px-4 py-2.5 text-sm font-semibold text-inherit hover:bg-white/10";
const ctaMain =
  "h-auto w-full rounded-2xl border-2 border-sun bg-sun px-5 py-[17px] font-display text-lg font-bold tracking-tight text-[#2a2200] shadow-[0_3px_0_var(--color-sun-deep)] hover:bg-[#ffdb62] active:translate-y-0.5 active:shadow-[0_1px_0_var(--color-sun-deep)] disabled:opacity-45";
const ctaQuiet =
  "h-auto w-full rounded-2xl border-2 border-line bg-transparent px-5 py-4 font-display text-base font-semibold text-foreground hover:bg-black/5 disabled:opacity-45";

/** Turn whatever a wallet throws (Error, plain object, string) into a sentence. */
function walletMessage(e: unknown, fallback: string): string {
  const raw =
    typeof e === "string"
      ? e
      : e && typeof e === "object" && "message" in e
        ? String((e as { message: unknown }).message)
        : "";
  if (/account not found/i.test(raw)) {
    return "This wallet has no testnet account yet. Fund it with Friendbot first.";
  }
  if (/declin|reject|denied|cancel/i.test(raw)) {
    return "You declined in the wallet. Nothing was sent.";
  }
  return raw || fallback;
}

/** Freighter's modal reports a closed popup as code -1. That is not an error. */
const closedPopup = (e: unknown) =>
  !!e && typeof e === "object" && (e as { code?: unknown }).code === -1;

function Logo() {
  return (
    <svg viewBox="0 0 64 64" fill="none" aria-hidden="true" className="size-8">
      <rect width="64" height="64" rx="15" fill="#ffd23f" />
      <path
        d="M17 12.5h16.5a19.5 19.5 0 0 1 0 39H17z"
        stroke="#0e4a37"
        strokeWidth="7"
        strokeLinejoin="round"
      />
      <path
        d="M28 32.5l5.5 5.5 9.5-11.5"
        stroke="#0e4a37"
        strokeWidth="6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CopyHash({ hash }: { hash: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="rounded-sm text-sm text-muted-foreground underline underline-offset-4 outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(hash);
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        } catch {
          /* clipboard blocked, the hash is still on screen */
        }
      }}
    >
      {done ? "Copied" : "Copy hash"}
    </button>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-5 border-b border-line py-[15px]">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-right font-semibold break-words">{children}</dd>
    </div>
  );
}

function ExtLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      className="underline decoration-foreground/35 underline-offset-4 hover:decoration-foreground"
      href={href}
      target="_blank"
      rel="noreferrer"
    >
      {children}
    </a>
  );
}

/** One of the three things the contract checks. Ticks once the due is paid. */
function Check({ done, title, hint }: { done: boolean; title: string; hint: string }) {
  return (
    <div
      className={cn(
        "grid justify-items-start gap-2 rounded-2xl border-[1.5px] bg-white px-3 pb-3 pt-3.5 text-[15px] leading-tight font-semibold transition-colors duration-300",
        done ? "border-brand" : "border-line",
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "grid size-[26px] place-items-center rounded-full border-2 transition-colors duration-300",
          done ? "border-brand bg-brand" : "border-line",
        )}
      >
        <span
          className={cn(
            "h-[11px] w-1.5 -translate-px rotate-40 border-white border-r-[2.5px] border-b-[2.5px] transition-opacity delay-150 duration-200",
            done ? "opacity-100" : "opacity-0",
          )}
        />
      </span>
      <span>
        {title}
        <small className="mt-0.5 block text-[13px] font-normal text-muted-foreground">
          {hint}
        </small>
      </span>
      <span className="sr-only">{done ? "checked" : "not checked yet"}</span>
    </div>
  );
}

function SetupPanel({
  ready,
  due,
  address,
  setup,
  copied,
  needUsdc,
  onFund,
  onTrust,
  onCopy,
  onRecheck,
}: {
  ready: Readiness;
  due: DueRecord;
  address: string;
  setup: null | "fund" | "trust";
  copied: boolean;
  needUsdc: boolean;
  onFund: () => void;
  onTrust: () => void;
  onCopy: () => void;
  onRecheck: () => void;
}) {
  const small =
    "h-auto rounded-xl border-2 border-foreground/80 bg-transparent px-4 py-2.5 text-sm font-semibold text-foreground hover:bg-black/5 disabled:opacity-45";
  const box = "mt-6 grid gap-2 rounded-2xl border-2 border-sun bg-[#fff8dc] p-4 text-[15.5px]";
  if (!ready.funded) {
    return (
      <div className={box} role="status">
        <p className="font-display text-lg leading-tight font-bold">
          This wallet has no testnet account yet
        </p>
        <p className="text-muted-foreground">
          A Stellar account is created separately on each network. Friendbot gives you
          free test XLM, which also creates the account.
        </p>
        <div>
          <Button className={small} disabled={setup !== null} onClick={onFund}>
            {setup === "fund" ? "Funding…" : "Fund with Friendbot"}
          </Button>
        </div>
      </div>
    );
  }
  if (!needUsdc) return null;
  if (!ready.trustline) {
    return (
      <div className={box} role="status">
        <p className="font-display text-lg leading-tight font-bold">Add the USDC trustline</p>
        <p className="text-muted-foreground">
          A wallet has to opt in to hold USDC. Your wallet will ask you to sign one small
          transaction.
        </p>
        <div>
          <Button className={small} disabled={setup !== null} onClick={onTrust}>
            {setup === "trust" ? "Waiting for the wallet…" : "Add USDC trustline"}
          </Button>
        </div>
      </div>
    );
  }
  if (ready.usdc < due.amount) {
    return (
      <div className={box} role="status">
        <p className="font-display text-lg leading-tight font-bold">
          You have {formatUsdc(ready.usdc)} USDC, this due needs {formatUsdc(due.amount)}
        </p>
        <p className="text-muted-foreground">
          Get free testnet USDC from Circle. Choose Stellar, then paste your address:{" "}
          <span className="font-mono text-xs break-all">{address}</span>
        </p>
        <div className="flex flex-wrap gap-2">
          <a
            className="inline-flex h-auto items-center rounded-xl border-2 border-foreground/80 px-4 py-2.5 text-sm font-semibold hover:bg-black/5"
            href={CIRCLE_FAUCET}
            target="_blank"
            rel="noreferrer"
          >
            Open Circle faucet
          </a>
          <Button className={small} onClick={onCopy}>
            {copied ? "Copied" : "Copy my address"}
          </Button>
          <Button className={small} onClick={onRecheck}>
            Check again
          </Button>
        </div>
      </div>
    );
  }
  return null;
}

export function DueApp() {
  const [dueId, setDueId] = useState(SEEDED_DUE_ID);
  const [due, setDue] = useState<DueRecord | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [address, setAddress] = useState<string | null>(null);
  const [wrongNetwork, setWrongNetwork] = useState(false);
  const [walletError, setWalletError] = useState<string | null>(null);
  const [trustline, setTrustline] = useState<boolean | null>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const [ready, setReady] = useState<Readiness | null>(null);
  const [setup, setSetup] = useState<null | "fund" | "trust">(null);
  const [copied, setCopied] = useState(false);
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  const [finding, setFinding] = useState(false);
  const [noneOpen, setNoneOpen] = useState(false);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("due");
    if (q && Number.isInteger(Number(q)) && Number(q) > 0) setDueId(Number(q));
  }, []);

  useEffect(() => {
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(t);
  }, []);

  const load = useCallback(async () => {
    try {
      setLoadError(null);
      setDue(await getDue(dueId));
    } catch (e) {
      setDue(null);
      setLoadError((e as Error).message);
    }
  }, [dueId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!due) return;
    let live = true;
    setTrustline(null);
    hasUsdcTrustline(due.recipient)
      .then((ok) => live && setTrustline(ok))
      .catch(() => live && setTrustline(null));
    return () => {
      live = false;
    };
  }, [due]);

  const refreshReady = useCallback(async () => {
    if (!address) return null;
    try {
      const r = await getReadiness(address);
      setReady(r);
      return r;
    } catch {
      setReady(null);
      return null;
    }
  }, [address]);

  useEffect(() => {
    setReady(null);
    if (address) void refreshReady();
  }, [address, refreshReady]);

  const checkNetwork = useCallback(async () => {
    const p = await walletPassphrase();
    const bad = p !== null && p !== NETWORK_PASSPHRASE;
    setWrongNetwork(bad);
    return !bad;
  }, []);

  async function onConnect() {
    setWalletError(null);
    try {
      setAddress(await connect());
      await checkNetwork();
    } catch (e) {
      if (!closedPopup(e)) setWalletError(walletMessage(e, "The wallet did not connect"));
    }
  }

  async function onDisconnect() {
    await disconnect().catch(() => {});
    setAddress(null);
    setWrongNetwork(false);
  }

  const expired = due ? now > due.deadline : false;
  const wrongAmount = due
    ? due.amount > STROOPS
      ? due.amount - STROOPS
      : due.amount / 2n
    : 0n;

  const canAct =
    !!address && !!due && !busy && !setup && !wrongNetwork && trustline !== false;
  const payerReady =
    !!ready && ready.funded && ready.trustline && !!due && ready.usdc >= due.amount;
  const canPay = canAct && payerReady;
  const canClose = canAct && !!ready?.funded;

  async function run(
    label: string,
    action: (addr: string) => Promise<TxOutcome>,
  ) {
    if (!address || busy) return;
    setWalletError(null);
    setBusy("prepare"); // blocks a second click while we look up the account and simulate
    if (!(await checkNetwork())) {
      setBusy(null);
      return;
    }
    try {
      const outcome = await action(address);
      setAttempts((a) => [{ key: Date.now(), label, outcome }, ...a]);
    } catch (e) {
      setWalletError(walletMessage(e, "Something went wrong. Nothing was sent."));
    } finally {
      setBusy(null);
      await load();
      await refreshReady();
    }
  }

  async function onFund() {
    if (!address) return;
    setWalletError(null);
    setSetup("fund");
    try {
      await fundWithFriendbot(address);
      // Horizon can lag a few seconds behind Friendbot, so look a few times.
      for (let i = 0; i < 6; i++) {
        const r = await refreshReady();
        if (r?.funded) break;
        await new Promise((res) => setTimeout(res, 1200));
      }
    } catch (e) {
      setWalletError(walletMessage(e, "Friendbot could not fund this account."));
    } finally {
      setSetup(null);
    }
  }

  async function onTrust() {
    if (!address) return;
    setWalletError(null);
    if (!(await checkNetwork())) return;
    setSetup("trust");
    try {
      const out = await addUsdcTrustline(address, (xdr) => sign(xdr, address), () => {});
      if (!out.ok) setWalletError(out.error ?? "The trustline was not added.");
    } catch (e) {
      setWalletError(walletMessage(e, "The trustline was not added."));
    } finally {
      setSetup(null);
      await refreshReady();
    }
  }

  async function onCopyAddress() {
    if (!address) return;
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked: the address is still shown */
    }
  }

  async function onNextOpen() {
    setFinding(true);
    setNoneOpen(false);
    try {
      const next = await findNextOpenDue(dueId);
      if (next === null) {
        setNoneOpen(true);
      } else {
        window.history.replaceState(null, "", `?due=${next}`);
        setDue(null);
        setLoadError(null);
        setDueId(next);
      }
    } catch {
      setNoneOpen(true);
    } finally {
      setFinding(false);
    }
  }

  const signer = (addr: string) => (xdr: string) => sign(xdr, addr);

  const onPay = () =>
    run(`Pay ${formatUsdc(due!.amount)} USDC`, (addr) =>
      pay(addr, due!, due!.amount, signer(addr), setBusy),
    );
  const onPayWrong = () =>
    run(`Pay ${formatUsdc(wrongAmount)} USDC`, (addr) =>
      payWrongAmountOnLedger(addr, due!, wrongAmount, signer(addr), setBusy),
    );
  const onClose = () =>
    run("Close due", (addr) => close(addr, due!.id, signer(addr), setBusy));

  const { deadlineAbs, timeLeft } = useMemo(() => {
    if (!due) return { deadlineAbs: "", timeLeft: "" };
    const abs = new Date(due.deadline * 1000).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
    const left = due.deadline - now;
    if (left <= 0) return { deadlineAbs: abs, timeLeft: "" };
    const h = Math.floor(left / 3600);
    const m = Math.floor((left % 3600) / 60);
    const rel =
      h >= 48
        ? `${Math.floor(h / 24)} days left`
        : h > 0
          ? `${h}h ${m}m left`
          : `${m}m ${left % 60}s left`;
    return { deadlineAbs: abs, timeLeft: rel };
  }, [due, now]);

  const paid = due?.status === "Paid";
  const open = due?.status === "Open" && !expired;
  const lapsed = due?.status === "Open" && expired;
  const amountText = due ? formatUsdc(due.amount) : "";
  // Long amounts get a smaller figure so they never overflow the hero.
  const figureSize =
    amountText.length <= 2
      ? "clamp(150px, 31vw, 330px)"
      : amountText.length <= 4
        ? "clamp(96px, 20vw, 220px)"
        : "clamp(64px, 12vw, 150px)";

  const statusText = !due
    ? ""
    : paid
      ? "Paid"
      : due.status === "Closed"
        ? "Closed unpaid"
        : lapsed
          ? "Past the deadline"
          : `Open, ${timeLeft}`;
  const dotClass = paid
    ? "bg-[#8de0b1] shadow-[0_0_0_4px_rgba(141,224,177,.22)]"
    : open
      ? "bg-sun shadow-[0_0_0_4px_rgba(255,210,63,.22)]"
      : "bg-[#c9c9c0]";

  const nextButton = (
    <Button
      variant="outline"
      className={ctaQuiet}
      disabled={finding}
      onClick={onNextOpen}
    >
      {finding ? "Looking…" : "Show next open due"}
    </Button>
  );

  return (
    <div className="grid min-h-dvh grid-cols-1 lg:grid-cols-[1.05fr_0.95fr]">
      <section
        aria-label="Amount due"
        className="relative flex flex-col overflow-hidden rounded-b-[30px] bg-brand px-6 pt-5 pb-10 text-[#f3f7ef] after:pointer-events-none after:absolute after:-right-[90px] after:-bottom-[90px] after:size-[360px] after:rounded-full after:border-[56px] after:border-white/5 after:content-[''] lg:min-h-dvh lg:rounded-r-[34px] lg:rounded-bl-none lg:px-12 lg:pt-9 lg:pb-11"
      >
        <div className="flex items-center justify-between gap-3">
          <h1 className="flex items-center gap-2.5 font-display text-[28px] leading-none font-bold tracking-tight">
            <Logo />
            Due
          </h1>
          <div className="flex items-center gap-2.5 text-sm">
            {address ? (
              <>
                <span className="hidden opacity-90 sm:inline">
                  Connected{" "}
                  <span className="font-semibold">{shortAddr(address)}</span>
                </span>
                <Button variant="outline" className={heroPill} onClick={onDisconnect}>
                  Disconnect
                </Button>
              </>
            ) : (
              <Button variant="outline" className={heroPill} onClick={onConnect}>
                Connect Freighter
              </Button>
            )}
          </div>
        </div>

        <div className="my-auto pt-9 pb-3">
          <p className="max-w-[20ch] font-display text-[clamp(19px,2.4vw,24px)] leading-tight font-medium opacity-90">
            A Stellar invoice that only settles an exact, on-time payment.
          </p>

          {due ? (
            <div
              className="mt-6 flex items-end gap-3.5 font-display leading-[0.78] font-extrabold tracking-[-0.06em] motion-safe:animate-[rise_0.5s_cubic-bezier(0.2,0.8,0.2,1)_both]"
              style={{ fontSize: figureSize }}
              aria-label={`${amountText} USDC`}
            >
              <span>{amountText}</span>
              <span className="pb-[0.16em] text-[clamp(26px,4vw,44px)] leading-none font-bold tracking-tight opacity-85">
                USDC
              </span>
            </div>
          ) : loadError ? (
            <div
              className="mt-6 font-display text-[clamp(120px,24vw,260px)] leading-[0.78] font-extrabold opacity-30"
              aria-hidden="true"
            >
              ?
            </div>
          ) : (
            <Skeleton className="mt-6 h-[clamp(120px,24vw,260px)] w-[min(78%,420px)] rounded-3xl bg-white/10" />
          )}

          {due && (
            <div className="mt-7 inline-flex items-center gap-2.5 rounded-full bg-white/12 py-2.5 pr-4 pl-3 text-base leading-none font-semibold">
              <span className={cn("size-[11px] rounded-full", dotClass)} />
              {statusText}
            </div>
          )}
        </div>
      </section>

      <main className="mx-auto flex w-full max-w-[640px] flex-col self-center px-6 pt-8 pb-16 lg:px-12 lg:pt-12">
        {wrongNetwork && (
          <Alert variant="destructive" className="mb-5">
            <AlertTitle>Your wallet is not on testnet</AlertTitle>
            <AlertDescription>
              Switch Freighter to Test Network, then try again. Nothing was sent.
              <Button className="mt-2" variant="outline" size="xs" onClick={checkNetwork}>
                Check again
              </Button>
            </AlertDescription>
          </Alert>
        )}
        {walletError && (
          <Alert variant="destructive" className="mb-5">
            <AlertTitle>Wallet</AlertTitle>
            <AlertDescription>{walletError}</AlertDescription>
          </Alert>
        )}

        {!due && !loadError && (
          <div className="flex flex-col gap-4" aria-busy="true">
            <Skeleton className="h-8 w-3/4" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        )}

        {loadError && (
          <div className="flex flex-col gap-4">
            <Alert variant="destructive">
              <AlertTitle>
                {loadError === "NotFound"
                  ? `Due ${dueId} does not exist`
                  : "Could not read the contract"}
              </AlertTitle>
              <AlertDescription>
                {loadError === "NotFound"
                  ? "Check the due number in the link."
                  : /fetch|network|timeout|abort/i.test(loadError)
                    ? "The Stellar testnet did not answer. Check your connection and try again."
                    : loadError}
              </AlertDescription>
            </Alert>
            {loadError === "NotFound" ? (
              nextButton
            ) : (
              <Button variant="outline" className={ctaQuiet} onClick={load}>
                Try again
              </Button>
            )}
            {noneOpen && (
              <p className="text-[15.5px] text-muted-foreground">No other open due right now.</p>
            )}
          </div>
        )}

        {due && (
          <>
            <h2 className="font-display text-[30px] leading-[1.1] font-bold tracking-tight">
              {due.reference ? (
                <>
                  Invoice <span className="font-medium text-muted-foreground">{due.reference}</span>
                </>
              ) : (
                `Due ${due.id}`
              )}
            </h2>

            <dl className="mt-[18px] border-t border-line">
              <Row label="Pay to">
                <ExtLink href={accountUrl(due.recipient)}>{shortAddr(due.recipient)}</ExtLink>
              </Row>
              <Row label="Pay by">{deadlineAbs}</Row>
              {due.payer && (
                <Row label="Paid by">
                  <ExtLink href={accountUrl(due.payer)}>{shortAddr(due.payer)}</ExtLink>
                </Row>
              )}
              <Row label="Due number">{due.id}</Row>
            </dl>

            <div className="mt-6 grid grid-cols-3 gap-2.5" aria-label="What the contract checks">
              <Check done={paid} title="Right asset" hint="USDC" />
              <Check done={paid} title="Right amount" hint={`exactly ${amountText}`} />
              <Check done={paid} title="On time" hint="before the deadline" />
            </div>

            {trustline === false && (
              <Alert variant="destructive" className="mt-6">
                <AlertTitle>Recipient has no USDC trustline</AlertTitle>
                <AlertDescription>The payment could not land, so the buttons are off.</AlertDescription>
              </Alert>
            )}

            {address && ready && !wrongNetwork && (open || lapsed) && (
              <SetupPanel
                ready={ready}
                due={due}
                address={address}
                setup={setup}
                copied={copied}
                needUsdc={open}
                onFund={onFund}
                onTrust={onTrust}
                onCopy={onCopyAddress}
                onRecheck={refreshReady}
              />
            )}

            <div className="mt-6 grid gap-2.5">
              {open && (
                <>
                  <Button className={ctaMain} disabled={!canPay} onClick={onPay}>
                    {busy === "prepare"
                      ? "Preparing…"
                      : busy === "wallet"
                        ? "Waiting for the wallet…"
                        : busy === "ledger"
                          ? "Waiting for the ledger…"
                          : `Pay ${amountText} USDC`}
                  </Button>
                  <Button
                    variant="outline"
                    className={ctaQuiet}
                    disabled={!canPay}
                    onClick={onPayWrong}
                  >
                    Try paying {formatUsdc(wrongAmount)} USDC
                  </Button>
                </>
              )}
              {lapsed && (
                <>
                  <Button className={ctaMain} disabled={!canClose} onClick={onClose}>
                    {busy ? "Working…" : "Close due"}
                  </Button>
                  {nextButton}
                </>
              )}
              {(paid || due.status === "Closed") && nextButton}
            </div>

            <p className="mt-3 text-[15.5px] text-muted-foreground">
              {open && !address && "Connect a testnet wallet to pay."}
              {open &&
                address &&
                payerReady &&
                "The money goes straight from you to the recipient in one transaction. The contract keeps nothing."}
              {open && address && !payerReady && "Finish the step above, then you can pay."}
              {lapsed &&
                "Nobody paid before the deadline, so anyone can close this due. Nothing was locked, so nothing is refunded."}
              {paid && "Paid in one transaction. USDC went from the payer to the recipient, and the contract kept nothing."}
              {due.status === "Closed" && "Closed unpaid after the deadline. The record stays on-chain."}
              {noneOpen && " No other open due right now."}
            </p>
          </>
        )}

        {attempts.length > 0 && (
          <section className="mt-8" aria-label="Your attempts">
            <h2 className="mb-1 font-display text-lg leading-none font-bold">Your attempts</h2>
            <ul>
              {attempts.map(({ key, label, outcome }) => (
                <li
                  key={key}
                  className="grid grid-cols-[1fr_auto] items-center gap-x-3.5 gap-y-1 border-b border-line py-3.5"
                >
                  <span className="font-bold">{label}</span>
                  <span
                    className={cn(
                      "rounded-full px-2.5 py-1.5 text-[13px] leading-none font-bold",
                      outcome.ok ? "bg-[#d9efe2] text-brand" : "bg-[#f6dcd7] text-brick",
                    )}
                  >
                    {outcome.ok ? "Succeeded" : (outcome.error ?? "Failed")}
                  </span>
                  {outcome.hash ? (
                    <>
                      <span className="text-sm text-muted-foreground">
                        <ExtLink href={txUrl(outcome.hash)}>
                          {outcome.hash.slice(0, 10)}…{outcome.hash.slice(-6)}
                        </ExtLink>
                      </span>
                      <span className="justify-self-end">
                        <CopyHash hash={outcome.hash} />
                      </span>
                    </>
                  ) : (
                    <span className="col-span-2 text-sm text-muted-foreground">
                      The contract refused this before it was sent. Nothing moved.
                    </span>
                  )}
                  {!outcome.ok && outcome.hash && isContractError(outcome.error) && (
                    <span className="col-span-2 text-sm text-muted-foreground">
                      Refused by the contract. No USDC moved.
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        <footer className="mt-9 grid gap-2 text-sm text-muted-foreground">
          <p>
            <strong className="font-semibold text-foreground">
              Testnet USDC. Not a legal invoice.
            </strong>{" "}
            A wrong recipient address still gets paid. Due checks the amount, the
            asset and the time, not who you meant to pay.
          </p>
          <p>
            Contract{" "}
            <ExtLink href={contractUrl(CONTRACT_ID)}>
              <span className="font-mono text-xs break-all">{CONTRACT_ID}</span>
            </ExtLink>
            . Not audited. No admin key.
          </p>
        </footer>
      </main>
    </div>
  );
}
