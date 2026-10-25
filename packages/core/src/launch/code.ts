// What a deployed collection's code must be, for the console to tell a correct deployment from a wrong one.
import { type Hex, pad, toHex } from "viem";
import { proofkinImmutables, proofkinRuntimeCode } from "./bytecode.ts";

/**
 * @notice The code a collection built with this mint price holds on the chain.
 * @dev The compiler leaves an empty word wherever the constructor will write the immutable `mintPrice`; the chain holds
 * the price there. Writing it into the compiled code gives bytes that must equal `getCode` exactly, with nothing masked
 * and so nothing a wrong deployment could hide in.
 * @param mintPrice - The price the constructor was given, in wei.
 * @returns The runtime code to expect.
 */
export function expectedProofkinRuntime(mintPrice: bigint): Hex {
  const word = pad(toHex(mintPrice), { size: 32 }).slice(2);
  let code = proofkinRuntimeCode.slice(2);
  for (const { start, length } of proofkinImmutables) {
    code = code.slice(0, start * 2) + word + code.slice((start + length) * 2);
  }
  return `0x${code}`;
}
