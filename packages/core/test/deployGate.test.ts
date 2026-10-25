import { zeroAddress } from "viem";
import { base, baseSepolia } from "viem/chains";
import { describe, expect, it } from "vitest";
import { confirmationTail, type DeployGateInput, deployGate, ownerInput } from "../src/launch/index.ts";

const OWNER = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";

describe("ownerInput", () => {
  it("is empty for nothing, and for spaces", () => {
    expect(ownerInput("")).toEqual({ status: "empty" });
    expect(ownerInput("   ")).toEqual({ status: "empty" });
  });

  it("is invalid for anything that is not an address, including one with a letter too few or a wrong checksum", () => {
    expect(ownerInput("vitalik.eth")).toEqual({ status: "invalid" });
    expect(ownerInput(OWNER.slice(0, -1))).toEqual({ status: "invalid" });
    expect(ownerInput(OWNER.replace("C8", "c8"))).toEqual({ status: "invalid" }); // mixed case that is not the checksum
  });

  it("is zero for the zero address, which could never administer anything", () => {
    expect(ownerInput(zeroAddress)).toEqual({ status: "zero" });
  });

  it("accepts an address in lowercase, uppercase-free or checksummed, with spaces round it, and gives the checksummed one", () => {
    expect(ownerInput(OWNER)).toEqual({ status: "ok", address: OWNER });
    expect(ownerInput(` ${OWNER.toLowerCase()} `)).toEqual({ status: "ok", address: OWNER });
  });
});

describe("deployGate", () => {
  const owner = ownerInput(OWNER);
  const ready: DeployGateInput = {
    wallet: "connected",
    network: "right",
    chainId: baseSepolia.id,
    owner,
    confirmation: "",
    busy: false,
  };
  const reason = (over: Partial<DeployGateInput>) => {
    const gate = deployGate({ ...ready, ...over });
    return gate.enabled ? undefined : gate.reason;
  };

  it("is open with a wallet on the right network and an owner named", () => {
    expect(deployGate(ready)).toEqual({ enabled: true });
  });

  it("says why it is closed, one thing at a time, in the order a person would fix them", () => {
    expect(reason({ busy: true })).toBe("A deployment is in progress, please wait.");
    expect(reason({ wallet: "none" })).toBe("Connect a wallet to deploy.");
    expect(reason({ wallet: "connecting" })).toBe("Connecting to your wallet…");
    expect(reason({ network: "wrong" })).toBe("Switch your wallet to the right network.");
    expect(reason({ owner: { status: "empty" } })).toBe("Name the owner first.");
    expect(reason({ owner: { status: "invalid" } })).toBe("The owner is not an address.");
    expect(reason({ owner: { status: "zero" } })).toBe("The owner cannot be the zero address.");
  });

  it("puts a wallet that is not there before an owner that is missing", () => {
    expect(reason({ wallet: "none", owner: { status: "empty" } })).toBe("Connect a wallet to deploy.");
    expect(reason({ busy: true, wallet: "none" })).toBe("A deployment is in progress, please wait.");
  });

  describe("on Base mainnet", () => {
    it("wants the last six characters of the owner's address, whatever else is in order", () => {
      expect(reason({ chainId: base.id })).toBe(
        "Type the last six characters of the owner's address to confirm a deployment to Base.",
      );
      expect(reason({ chainId: base.id, confirmation: "dd79c" })).toMatch(/last six characters/);
    });

    it("opens when they are typed, in either case", () => {
      expect(deployGate({ ...ready, chainId: base.id, confirmation: confirmationTail(OWNER) })).toEqual({ enabled: true });
      expect(deployGate({ ...ready, chainId: base.id, confirmation: confirmationTail(OWNER).toUpperCase() })).toEqual({
        enabled: true,
      });
    });

    it("is not opened by the tail of some other address", () => {
      expect(reason({ chainId: base.id, confirmation: confirmationTail("0x5FbDB2315678afecb367f032d93F642f64180aa3") })).toMatch(
        /last six characters/,
      );
    });

    it("asks nothing more of a launch that is already under way, since it was confirmed when it began", () => {
      expect(deployGate({ ...ready, chainId: base.id, confirmation: "", resuming: true })).toEqual({ enabled: true });
      expect(reason({ chainId: base.id, resuming: true, wallet: "none" })).toBe("Connect a wallet to deploy.");
    });

    it("asks nothing of a testnet, whatever was typed", () => {
      expect(deployGate({ ...ready, chainId: baseSepolia.id, confirmation: "" })).toEqual({ enabled: true });
    });
  });
});
