import { describe, expect, it } from "vitest";
import { commitHash, newSalt, programHash } from "../src/commitment.ts";

// Computed independently with `cast keccak $(cast abi-encode 'f(bytes,address,bytes32)' ...)`.
const PROGRAM = "0x0100010100000000ff";
const SENDER = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
const SALT = "0x0000000000000000000000000000000000000000000000000000000000000001";

describe("commitHash", () => {
  it("is keccak256(abi.encode(program, sender, salt)), as Proofkin.reveal recomputes it", () => {
    expect(commitHash(PROGRAM, SENDER, SALT)).toBe("0xd41fc626795d60d247641b4326a7242ea6657923b1135145df81746bef47b3dd");
  });

  it("takes the program as bytes or as hex", () => {
    const bytes = Uint8Array.from([0x01, 0x00, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00, 0xff]);
    expect(commitHash(bytes, SENDER, SALT)).toBe(commitHash(PROGRAM, SENDER, SALT));
  });

  it("changes with the program, the sender and the salt", () => {
    const base = commitHash(PROGRAM, SENDER, SALT);
    expect(commitHash("0x0100010100000000fe", SENDER, SALT)).not.toBe(base);
    expect(commitHash(PROGRAM, "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC", SALT)).not.toBe(base);
    expect(commitHash(PROGRAM, SENDER, `0x${"00".repeat(31)}02`)).not.toBe(base);
  });

  it("does not depend on the address's letter case", () => {
    expect(commitHash(PROGRAM, SENDER.toLowerCase() as `0x${string}`, SALT)).toBe(commitHash(PROGRAM, SENDER, SALT));
  });
});

describe("programHash", () => {
  it("is keccak256 of the program bytes, the key of Proofkin.seen", () => {
    expect(programHash(PROGRAM)).toBe("0x150cb5fb7b59f73cf4291e8dfc54e5ec7535ee64f0b371f83efa90b0ee3b0123");
  });
});

describe("newSalt", () => {
  it("is 32 random bytes as hex", () => {
    const a = newSalt();
    expect(a).toMatch(/^0x[0-9a-f]{64}$/);
    expect(newSalt()).not.toBe(a);
  });

  it("takes its randomness from the source it is given", () => {
    expect(newSalt((b) => b.fill(0x07))).toBe(`0x${"07".repeat(32)}`);
  });
});
