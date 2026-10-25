import { describe, expect, it } from "vitest";
import { proofkinAbi } from "../src/abi.ts";
import { friendlyError, MINT_ERROR_NAMES, NOT_ON_THE_MINT_PATH } from "../src/mint.ts";

const abiErrors: readonly string[] = proofkinAbi.filter((item) => item.type === "error").map((item) => item.name);
// a tuple of literals only accepts those literals in `includes`, and the point here is to ask about every name
const notOnMintPath: readonly string[] = NOT_ON_THE_MINT_PATH;
const mintErrors: readonly string[] = MINT_ERROR_NAMES;

describe("the contract's errors", () => {
  it("are each either explained to a minter or deliberately left out as not on the mint path: a new one breaks this", () => {
    const unaccounted = abiErrors.filter((name) => !mintErrors.includes(name) && !notOnMintPath.includes(name));
    expect(unaccounted).toEqual([]);
  });

  it("are never both: an error that is explained is not 'not on the mint path'", () => {
    expect(mintErrors.filter((name) => notOnMintPath.includes(name))).toEqual([]);
  });

  it("are all real, so a renamed error leaves no stale entry in either list", () => {
    const stale = [...mintErrors, ...notOnMintPath].filter((name) => !abiErrors.includes(name));
    expect(stale).toEqual([]);
  });

  it("have a sentence for every one a minter can meet at commit or reveal", () => {
    for (const name of ["NoCommit", "TooEarly", "Expired", "NoBlockhash", "WrongPayment", "AlreadyMinted", "PuzzleFull", "AlreadyCommitted", "SolveFailed"]) {
      expect(mintErrors).toContain(name);
    }
  });

  it("keep the admin and transfer errors out of the minter's list", () => {
    for (const name of ["Unauthorized", "RendererLocked", "InvalidRenderer", "NotOwnerNorApproved", "TransferToZeroAddress"]) {
      expect(notOnMintPath).toContain(name);
    }
  });

  it("friendlyError still says something plain for a name it does not know, rather than the raw error", () => {
    expect(friendlyError("some string")).toBe("some string");
    expect(friendlyError(undefined)).toBe("Something went wrong.");
  });
});
