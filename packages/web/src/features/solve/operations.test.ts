import { OP_NAMES } from "@proofkin/vm";
import { describe, expect, it } from "vitest";

import { OPERATIONS } from "@/features/solve/operations";

describe("OPERATIONS, the reference under the editor", () => {
  it("has exactly the operations the VM runs, in its order, so a new one cannot go undocumented", () => {
    expect(OPERATIONS.map((operation) => operation.name)).toEqual([...OP_NAMES]);
  });

  it("shows each one as it is written in a program: its name, then what it takes", () => {
    for (const operation of OPERATIONS) {
      expect(operation.usage.split(" ")[0]).toBe(operation.name);
      expect(operation.meaning.length).toBeGreaterThan(10);
    }
  });

  it("says what makes an operation fail where it can", () => {
    const meaning = (name: string) => OPERATIONS.find((operation) => operation.name === name)!.meaning;
    expect(meaning("ADD")).toMatch(/4294967295/);
    expect(meaning("SUB")).toMatch(/larger/);
    expect(meaning("DIV")).toMatch(/0/);
  });
});
