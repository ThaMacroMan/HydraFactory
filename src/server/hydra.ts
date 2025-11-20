import { HydraProvider, HydraInstance } from "@meshsdk/hydra";
import { DEFAULT_HYDRA_HTTP, DEFAULT_HYDRA_WS } from "./constants";

function createProvider() {
  return new HydraProvider({
    httpUrl: DEFAULT_HYDRA_HTTP,
    wsUrl: DEFAULT_HYDRA_WS,
  });
}

async function withProvider<T>(cb: (provider: HydraProvider) => Promise<T>) {
  const provider = createProvider();
  try {
    await provider.connect();
    return await cb(provider);
  } finally {
    await provider.disconnect();
  }
}

async function withInstance<T>(
  cb: (provider: HydraProvider, instance: HydraInstance) => Promise<T>
) {
  const provider = createProvider();
  const instance = new HydraInstance({
    provider,
    fetcher: provider,
    submitter: provider,
  });

  try {
    await provider.connect();
    return await cb(provider, instance);
  } finally {
    await provider.disconnect();
  }
}

type Payload = Record<string, unknown>;

function stringFrom(payload: Payload, key: string) {
  const value = payload[key];
  return typeof value === "string" ? value : undefined;
}

function numberFrom(payload: Payload, key: string, fallback = 0) {
  const value = payload[key];
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }
  return fallback;
}

export async function runHydraAction(action: string, payload: Payload) {
  switch (action) {
    case "init":
      return withProvider((provider) => provider.init());
    case "abort":
      return withProvider((provider) => provider.abort());
    case "close":
      return withProvider((provider) => provider.close());
    case "contest":
      return withProvider((provider) => provider.contest());
    case "fanout":
      return withProvider((provider) => provider.fanout());
    case "get-utxos":
      return withProvider((provider) => provider.getUTXOs());
    case "new-tx": {
      const cborHex = stringFrom(payload, "cborHex");
      if (!cborHex) {
        throw new Error("cborHex is required");
      }
      return withProvider((provider) =>
        provider.newTx({
          cborHex,
          description: stringFrom(payload, "description") ?? "",
          type: stringFrom(payload, "type") ?? "Tx ConwayEra",
        })
      );
    }
    case "commit-empty":
      return withInstance((_provider, instance) => instance.commitEmpty());
    case "commit-funds": {
      const txHash = stringFrom(payload, "txHash");
      if (!txHash) {
        throw new Error("txHash is required");
      }
      const outputIndex = numberFrom(payload, "outputIndex", 0);
      return withInstance((_provider, instance) =>
        instance.commitFunds(txHash, outputIndex)
      );
    }
    case "decommit": {
      const cborHex = stringFrom(payload, "cborHex");
      if (!cborHex) {
        throw new Error("cborHex is required");
      }
      return withProvider((provider) =>
        provider.decommit({
          cborHex,
          description: stringFrom(payload, "description") ?? "decommit",
          type: stringFrom(payload, "type") ?? "Tx ConwayEra",
        })
      );
    }
    default:
      throw new Error(`Unsupported action ${action}`);
  }
}
