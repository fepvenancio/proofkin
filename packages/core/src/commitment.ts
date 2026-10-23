// The two hashes the mint flow needs, in the exact layout the contract uses.
import { type Address, bytesToHex, encodeAbiParameters, type Hex, keccak256 } from "viem";
import { randomSeed } from "./localTest.ts";

const toHex = (program: Hex | Uint8Array): Hex => (typeof program === "string" ? program : bytesToHex(program));

/**
 * `keccak256(abi.encode(program, msg.sender, salt))`: what `commit` stores and `reveal` recomputes. The
 * sender is part of it, so only the committing account can reveal.
 */
export function commitHash(program: Hex | Uint8Array, sender: Address, salt: Hex): Hex {
  return keccak256(
    encodeAbiParameters([{ type: "bytes" }, { type: "address" }, { type: "bytes32" }], [toHex(program), sender, salt]),
  );
}

/** `keccak256(program)`: the key of `Proofkin.seen`, to ask whether this exact program is taken. */
export function programHash(program: Hex | Uint8Array): Hex {
  return keccak256(toHex(program));
}

/** 32 random bytes. Without the salt a commit cannot be revealed, so it is saved before it is used. */
export const newSalt = randomSeed;
