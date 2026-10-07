import {
  Account,
  Address,
  Asset,
  BASE_FEE,
  Contract,
  Keypair,
  Networks,
  Operation,
  TransactionBuilder,
  nativeToScVal,
  rpc,
  scValToNative,
  xdr,
  type Transaction,
} from "@stellar/stellar-sdk";
import {
  CONTRACT_ID,
  FRIENDBOT_URL,
  HORIZON_URL,
  NETWORK_PASSPHRASE,
  RPC_URL,
  USDC_ISSUER,
} from "./config";

export const STROOPS = 10_000_000n;
export const server = new rpc.Server(RPC_URL);

export type Status = "Open" | "Paid" | "Closed";

export type DueRecord = {
  id: number;
  recipient: string;
  token: string;
  amount: bigint;
  deadline: number; // unix seconds
  reference: string;
  status: Status;
  payer: string | null;
};

const ERRORS: Record<number, string> = {
  1: "NotFound",
  2: "BadAmount",
  3: "DeadlinePast",
  4: "NotOpen",
  5: "WrongAmount",
  6: "WrongToken",
  7: "StillOpen",
};

/** True for errors Due itself returns, as opposed to a network or auth failure. */
export const isContractError = (name: string | null) =>
  name !== null && Object.values(ERRORS).includes(name);

const STATUS: Status[] = ["Open", "Paid", "Closed"];

export const usdcContractId = () =>
  new Asset("USDC", USDC_ISSUER).contractId(Networks.TESTNET);

export function formatUsdc(stroops: bigint): string {
  const whole = stroops / STROOPS;
  const frac = (stroops % STROOPS).toString().padStart(7, "0").replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : `${whole}`;
}

export const shortAddr = (a: string) => `${a.slice(0, 4)}…${a.slice(-4)}`;

/** Pull a contract error name out of a simulation or result error string. */
export function contractErrorName(text: string): string | null {
  const m = /Error\(Contract, #(\d+)\)/.exec(text);
  return m ? (ERRORS[Number(m[1])] ?? `Error #${m[1]}`) : null;
}

function referenceText(bytes: Uint8Array): string {
  let end = bytes.length;
  while (end > 0 && bytes[end - 1] === 0) end--;
  return new TextDecoder().decode(bytes.slice(0, end));
}

function callTx(source: Account, method: string, ...args: ReturnType<typeof nativeToScVal>[]) {
  return new TransactionBuilder(source, {
    fee: BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(new Contract(CONTRACT_ID).call(method, ...args))
    .setTimeout(120)
    .build();
}

/** Read a due. Needs no wallet and no funded account. */
export async function getDue(id: number): Promise<DueRecord> {
  const source = new Account(Keypair.random().publicKey(), "0");
  const sim = await server.simulateTransaction(
    callTx(source, "get", nativeToScVal(id, { type: "u32" })),
  );
  if (rpc.Api.isSimulationError(sim)) {
    throw new Error(contractErrorName(sim.error) ?? sim.error);
  }
  if (!sim.result) throw new Error("Empty response from the contract");
  const d = scValToNative(sim.result.retval);
  return {
    id: d.id,
    recipient: d.recipient,
    token: d.token,
    amount: BigInt(d.amount),
    deadline: Number(d.deadline),
    reference: referenceText(d.reference),
    status: STATUS[Number(d.status)] ?? "Open",
    payer: d.payer ?? null,
  };
}

/**
 * Find another due that can still be paid: open and before its deadline.
 * Looks after `fromId` first, then wraps to the start. Ids run from 1 up with
 * no gaps, so the first NotFound marks the end.
 */
export async function findNextOpenDue(fromId: number): Promise<number | null> {
  const now = Math.floor(Date.now() / 1000);
  const usable = (d: DueRecord) => d.status === "Open" && d.deadline >= now;
  const BATCH = 6;
  const MAX = 60;
  let end = Infinity;
  const scan = async (start: number, stop: number): Promise<number | null> => {
    for (let id = start; id < stop && id <= MAX && id < end; id += BATCH) {
      const ids = Array.from({ length: Math.min(BATCH, stop - id) }, (_, i) => id + i);
      const results = await Promise.all(
        ids.map((n) =>
          getDue(n).then(
            (d) => d,
            (e: Error) => (e.message === "NotFound" ? null : undefined),
          ),
        ),
      );
      for (const [i, n] of ids.entries()) {
        const r = results[i];
        if (r === null) {
          end = Math.min(end, n);
          break;
        }
        if (r && usable(r)) return r.id;
      }
    }
    return null;
  };
  const after = await scan(fromId + 1, MAX + 1);
  if (after !== null) return after;
  return scan(1, fromId);
}

/** Parse a Horizon decimal string such as "20.0000000" into stroops, without floats. */
export function parseStroops(decimal: string): bigint {
  const [whole = "0", frac = ""] = decimal.split(".");
  return BigInt(whole) * STROOPS + BigInt(frac.padEnd(7, "0").slice(0, 7));
}

export type Readiness = { funded: boolean; trustline: boolean; usdc: bigint };

/** What a wallet still needs before it can pay: an account, a USDC trustline, USDC. */
export async function getReadiness(account: string): Promise<Readiness> {
  const res = await fetch(`${HORIZON_URL}/accounts/${account}`);
  if (res.status === 404) return { funded: false, trustline: false, usdc: 0n };
  if (!res.ok) throw new Error(`Horizon answered ${res.status}`);
  const body = (await res.json()) as {
    balances: { asset_code?: string; asset_issuer?: string; balance: string }[];
  };
  const line = body.balances.find(
    (b) => b.asset_code === "USDC" && b.asset_issuer === USDC_ISSUER,
  );
  return {
    funded: true,
    trustline: !!line,
    usdc: line ? parseStroops(line.balance) : 0n,
  };
}

/** True when the account holds a USDC trustline. */
export async function hasUsdcTrustline(account: string): Promise<boolean> {
  try {
    return (await getReadiness(account)).trustline;
  } catch {
    return false;
  }
}

/** Ask Friendbot for free testnet XLM, which also creates the account. */
export async function fundWithFriendbot(account: string): Promise<void> {
  const res = await fetch(`${FRIENDBOT_URL}/?addr=${encodeURIComponent(account)}`);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    if (/already funded|createAccountAlreadyExist/i.test(text)) return;
    throw new Error("Friendbot could not fund this account. Try again in a moment.");
  }
}

export type Signer = (xdr: string) => Promise<string>;

export type TxOutcome = {
  hash: string | null;
  ok: boolean;
  error: string | null; // contract error name when the call was refused
};

type Phase = "wallet" | "ledger";

function payArgs(payer: string, id: number, token: string, amount: bigint) {
  return [
    new Address(payer).toScVal(),
    nativeToScVal(id, { type: "u32" }),
    new Address(token).toScVal(),
    nativeToScVal(amount, { type: "i128" }),
  ];
}

async function submit(
  tx: Transaction,
  sign: Signer,
  onPhase: (p: Phase) => void,
): Promise<TxOutcome> {
  onPhase("wallet");
  const signed = TransactionBuilder.fromXDR(await sign(tx.toXDR()), NETWORK_PASSPHRASE);
  onPhase("ledger");
  const sent = await server.sendTransaction(signed);
  if (sent.status === "ERROR") {
    return { hash: sent.hash, ok: false, error: "The network rejected the transaction" };
  }
  const done = await server.pollTransaction(sent.hash, { attempts: 30 });
  if (done.status === rpc.Api.GetTransactionStatus.SUCCESS) {
    return { hash: sent.hash, ok: true, error: null };
  }
  const events = done.status === rpc.Api.GetTransactionStatus.FAILED ? done.diagnosticEventsXdr : undefined;
  return {
    hash: sent.hash,
    ok: false,
    error: errorFromEvents(events) ?? "The transaction failed on the ledger",
  };
}

/** Name the error in a failed transaction's diagnostic events. */
export function errorFromEvents(events?: xdr.DiagnosticEvent[]): string | null {
  for (const d of events ?? []) {
    for (const topic of d.event.body.v0.topics) {
      if (topic.type !== "scvError") continue;
      const err = topic.error;
      if (err.type === "sceContract") {
        return ERRORS[err.contractCode] ?? `Error #${err.contractCode}`;
      }
      return err.type.replace(/^sce/, "") + " error";
    }
  }
  return null;
}

/**
 * Pay a due. If the contract refuses in simulation (wrong amount, late, already
 * paid), nothing is submitted and the error name comes back with no hash.
 */
export async function pay(
  payer: string,
  due: DueRecord,
  amount: bigint,
  sign: Signer,
  onPhase: (p: Phase) => void,
): Promise<TxOutcome> {
  const account = await server.getAccount(payer);
  const tx = callTx(account, "pay", ...payArgs(payer, due.id, due.token, amount));
  const sim = await server.simulateTransaction(tx);
  if (rpc.Api.isSimulationError(sim)) {
    return { hash: null, ok: false, error: contractErrorName(sim.error) ?? sim.error };
  }
  return submit(await server.prepareTransaction(tx), sign, onPhase);
}

/**
 * Put a wrong-amount attempt on the ledger so it has a transaction hash.
 * The footprint comes from simulating the exact amount; the submitted call
 * carries the wrong amount, and the contract refuses it before any transfer.
 */
export async function payWrongAmountOnLedger(
  payer: string,
  due: DueRecord,
  wrongAmount: bigint,
  sign: Signer,
  onPhase: (p: Phase) => void,
): Promise<TxOutcome> {
  const account = await server.getAccount(payer);
  const good = callTx(account, "pay", ...payArgs(payer, due.id, due.token, due.amount));
  const sim = await server.simulateTransaction(good);
  if (rpc.Api.isSimulationError(sim)) {
    return { hash: null, ok: false, error: contractErrorName(sim.error) ?? sim.error };
  }
  const prepared = await server.prepareTransaction(good);
  const args = payArgs(payer, due.id, due.token, wrongAmount);
  // The simulated auth entry commits to the exact amount, so rebuild it for the
  // wrong amount. Source-account credentials need no signature of their own.
  const auth = new xdr.SorobanAuthorizationEntry({
    credentials: xdr.SorobanCredentials.sorobanCredentialsSourceAccount(),
    rootInvocation: new xdr.SorobanAuthorizedInvocation({
      function: xdr.SorobanAuthorizedFunction.sorobanAuthorizedFunctionTypeContractFn(
        new xdr.InvokeContractArgs({
          contractAddress: new Address(CONTRACT_ID).toScAddress(),
          functionName: "pay",
          args,
        }),
      ),
      subInvocations: [],
    }),
  });
  const bad = new TransactionBuilder(await server.getAccount(payer), {
    fee: prepared.fee,
    networkPassphrase: NETWORK_PASSPHRASE,
    sorobanData: sim.transactionData.build(),
  })
    .addOperation(
      Operation.invokeContractFunction({
        contract: CONTRACT_ID,
        function: "pay",
        args,
        auth: [auth],
      }),
    )
    .setTimeout(120)
    .build();
  return submit(bad, sign, onPhase);
}

/** Close an unpaid due after its deadline. Anyone may call it. */
export async function close(
  caller: string,
  id: number,
  sign: Signer,
  onPhase: (p: Phase) => void,
): Promise<TxOutcome> {
  const account = await server.getAccount(caller);
  const tx = callTx(account, "close", nativeToScVal(id, { type: "u32" }));
  const sim = await server.simulateTransaction(tx);
  if (rpc.Api.isSimulationError(sim)) {
    return { hash: null, ok: false, error: contractErrorName(sim.error) ?? sim.error };
  }
  return submit(await server.prepareTransaction(tx), sign, onPhase);
}

/** Add a USDC trustline to the connected wallet. The wallet signs it. */
export async function addUsdcTrustline(
  account: string,
  sign: Signer,
  onPhase: (p: Phase) => void,
): Promise<TxOutcome> {
  const source = await server.getAccount(account);
  const tx = new TransactionBuilder(source, {
    fee: BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(Operation.changeTrust({ asset: new Asset("USDC", USDC_ISSUER) }))
    .setTimeout(120)
    .build();
  return submit(tx, sign, onPhase);
}
