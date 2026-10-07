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

/** True when the account holds a USDC trustline. */
export async function hasUsdcTrustline(account: string): Promise<boolean> {
  const res = await fetch(`${HORIZON_URL}/accounts/${account}`);
  if (!res.ok) return false;
  const body = (await res.json()) as {
    balances: { asset_code?: string; asset_issuer?: string }[];
  };
  return body.balances.some(
    (b) => b.asset_code === "USDC" && b.asset_issuer === USDC_ISSUER,
  );
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
