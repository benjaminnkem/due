"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Copy, ExternalLink } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  CONTRACT_ID,
  NETWORK_PASSPHRASE,
  SEEDED_DUE_ID,
  accountUrl,
  contractUrl,
  txUrl,
} from "@/lib/config";
import {
  STROOPS,
  close,
  findNextOpenDue,
  formatUsdc,
  getDue,
  hasUsdcTrustline,
  isContractError,
  pay,
  payWrongAmountOnLedger,
  shortAddr,
  type DueRecord,
  type TxOutcome,
} from "@/lib/due";
import { connect, disconnect, sign, walletPassphrase } from "@/lib/wallet";

type Busy = null | "wallet" | "ledger";
type Attempt = {
  key: number;
  label: string;
  outcome: TxOutcome;
};

function Mono({ children }: { children: React.ReactNode }) {
  return <span className="font-mono text-[0.8125rem]">{children}</span>;
}

function CopyHash({ hash }: { hash: string }) {
  const [done, setDone] = useState(false);
  return (
    <Button
      variant="ghost"
      size="xs"
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
      {done ? <Check /> : <Copy />}
      {done ? "Copied" : "Copy hash"}
    </Button>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-right text-sm break-words">{children}</dd>
    </div>
  );
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
      setWalletError((e as Error).message || "The wallet did not connect");
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
    !!address && !!due && !busy && !wrongNetwork && trustline !== false;

  async function run(
    label: string,
    action: (addr: string) => Promise<TxOutcome>,
  ) {
    if (!address) return;
    setWalletError(null);
    if (!(await checkNetwork())) return;
    try {
      const outcome = await action(address);
      setAttempts((a) => [{ key: Date.now(), label, outcome }, ...a]);
    } catch (e) {
      const msg = (e as Error).message || "The wallet declined";
      setWalletError(msg);
    } finally {
      setBusy(null);
      await load();
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

  const deadlineText = useMemo(() => {
    if (!due) return "";
    const d = new Date(due.deadline * 1000);
    const abs = d.toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
    const left = due.deadline - now;
    if (left <= 0) return `${abs} (passed)`;
    const h = Math.floor(left / 3600);
    const m = Math.floor((left % 3600) / 60);
    const rel = h >= 48 ? `${Math.floor(h / 24)} days left` : h > 0 ? `${h}h ${m}m left` : `${m}m ${left % 60}s left`;
    return `${abs} (${rel})`;
  }, [due, now]);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col gap-5 px-4 py-8 sm:py-12">
      <header className="flex flex-col gap-1">
        <h1 className="flex items-center gap-3 text-3xl font-semibold tracking-tight">
          {/* eslint-disable-next-line @next/next/no-img-element -- small static SVG */}
          <img src="/logo.svg" alt="" width={36} height={36} />
          Due
        </h1>
        <p className="text-muted-foreground">
          A Stellar invoice that only settles an exact, on-time payment.
        </p>
      </header>

      <Alert>
        <AlertTitle>Testnet USDC. Not a legal invoice.</AlertTitle>
        <AlertDescription>
          A wrong recipient address still gets paid. Due checks the amount, the
          asset and the time. It does not check who you meant to pay.
        </AlertDescription>
      </Alert>

      <div className="flex flex-wrap items-center justify-between gap-2">
        {address ? (
          <>
            <span className="text-sm text-muted-foreground">
              Connected <Mono>{shortAddr(address)}</Mono>
            </span>
            <Button variant="outline" size="sm" onClick={onDisconnect}>
              Disconnect
            </Button>
          </>
        ) : (
          <>
            <span className="text-sm text-muted-foreground">
              Wallet not connected. You can read the due without one.
            </span>
            <Button size="sm" onClick={onConnect}>
              Connect Freighter
            </Button>
          </>
        )}
      </div>

      {wrongNetwork && (
        <Alert variant="destructive">
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
        <Alert variant="destructive">
          <AlertTitle>Wallet</AlertTitle>
          <AlertDescription>{walletError}</AlertDescription>
        </Alert>
      )}

      {!due && !loadError && (
        <Card>
          <CardHeader>
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-9 w-32" />
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
          </CardContent>
        </Card>
      )}

      {loadError && (
        <Alert variant="destructive">
          <AlertTitle>
            {loadError === "NotFound" ? `Due ${dueId} does not exist` : "Could not read the contract"}
          </AlertTitle>
          <AlertDescription>
            {loadError === "NotFound"
              ? "Check the due number in the link."
              : loadError}
            <Button className="mt-2" variant="outline" size="xs" onClick={load}>
              Try again
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {due && (
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardDescription>
                  Due #{due.id}
                  {due.reference ? <> · <Mono>{due.reference}</Mono></> : null}
                </CardDescription>
                <CardTitle className="mt-1 text-3xl tabular-nums">
                  {formatUsdc(due.amount)} USDC
                </CardTitle>
              </div>
              <Badge
                variant={due.status === "Paid" ? "default" : due.status === "Closed" ? "secondary" : "outline"}
              >
                {due.status === "Open" && expired ? "Expired" : due.status}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <dl className="divide-y divide-border">
              <Row label="Recipient">
                <a
                  className="underline underline-offset-2"
                  href={accountUrl(due.recipient)}
                  target="_blank"
                  rel="noreferrer"
                >
                  <Mono>{shortAddr(due.recipient)}</Mono>
                </a>
              </Row>
              <Row label="Deadline">{deadlineText}</Row>
              {due.payer && (
                <Row label="Paid by">
                  <a
                    className="underline underline-offset-2"
                    href={accountUrl(due.payer)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <Mono>{shortAddr(due.payer)}</Mono>
                  </a>
                </Row>
              )}
            </dl>
            {trustline === false && (
              <Alert variant="destructive" className="mt-4">
                <AlertTitle>Recipient has no USDC trustline</AlertTitle>
                <AlertDescription>
                  The payment could not land, so the buttons are off.
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
          <CardFooter className="flex flex-col items-stretch gap-2">
            {due.status === "Open" && !expired && (
              <>
                <Button disabled={!canAct} onClick={onPay}>
                  {busy === "wallet"
                    ? "Waiting for the wallet…"
                    : busy === "ledger"
                      ? "Waiting for the ledger…"
                      : `Pay ${formatUsdc(due.amount)} USDC`}
                </Button>
                <Button variant="outline" disabled={!canAct} onClick={onPayWrong}>
                  Try paying {formatUsdc(wrongAmount)} USDC
                </Button>
                {!address && (
                  <p className="text-sm text-muted-foreground">
                    Connect a testnet wallet to pay.
                  </p>
                )}
              </>
            )}
            {due.status === "Open" && expired && (
              <>
                <p className="text-sm text-muted-foreground">
                  The deadline passed and nobody paid. Anyone can close it.
                  Nothing was locked, so nothing is refunded.
                </p>
                <Button disabled={!canAct} onClick={onClose}>
                  {busy ? "Working…" : "Close due"}
                </Button>
              </>
            )}
            {due.status === "Paid" && (
              <p className="text-sm text-muted-foreground">
                Paid. USDC went from the payer to the recipient in one
                transaction. The contract kept nothing.
              </p>
            )}
            {due.status === "Closed" && (
              <p className="text-sm text-muted-foreground">
                Closed unpaid after the deadline. The record stays on-chain.
              </p>
            )}
            {(due.status !== "Open" || expired) && (
              <>
                <Button variant="outline" disabled={finding} onClick={onNextOpen}>
                  {finding ? "Looking…" : "Show next open due"}
                </Button>
                {noneOpen && (
                  <p className="text-sm text-muted-foreground">
                    No other open due right now.
                  </p>
                )}
              </>
            )}
          </CardFooter>
        </Card>
      )}

      {attempts.length > 0 && (
        <section className="flex flex-col gap-3" aria-label="Your attempts">
          <h2 className="text-sm font-medium text-muted-foreground">This session</h2>
          {attempts.map(({ key, label, outcome }) => (
            <Card key={key} size="sm">
              <CardContent className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-medium">{label}</span>
                  <Badge variant={outcome.ok ? "default" : "destructive"}>
                    {outcome.ok ? "Succeeded" : (outcome.error ?? "Failed")}
                  </Badge>
                </div>
                {outcome.hash ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <a
                      className="inline-flex items-center gap-1 text-sm underline underline-offset-2"
                      href={txUrl(outcome.hash)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <Mono>{outcome.hash.slice(0, 10)}…{outcome.hash.slice(-6)}</Mono>
                      <ExternalLink className="size-3" />
                    </a>
                    <CopyHash hash={outcome.hash} />
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    The contract refused this before it was sent. Nothing moved.
                  </p>
                )}
                {!outcome.ok && outcome.hash && isContractError(outcome.error) && (
                  <p className="text-sm text-muted-foreground">
                    Refused by the contract. No USDC moved.
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </section>
      )}

      <Separator />
      <footer className="flex flex-col gap-1 text-xs text-muted-foreground">
        <span>
          Contract{" "}
          <a
            className="underline underline-offset-2"
            href={contractUrl(CONTRACT_ID)}
            target="_blank"
            rel="noreferrer"
          >
            <Mono>{CONTRACT_ID}</Mono>
          </a>
        </span>
        <span>Testnet only. Not audited. No admin key, no way to move funds after deploy.</span>
      </footer>
    </main>
  );
}
