import { type PendingDeploy } from "@proofkin/core/launch";
import { describe, expect, it } from "vitest";

import { deployStepStates } from "@/features/admin/steps";

const base: PendingDeploy = {
  version: 1,
  chainId: 84532,
  account: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
  owner: "0x90F79bf6EB2c4f870365E785982E1f101E93b906",
  status: "prepared",
  createdAt: 1,
};

describe("deployStepStates", () => {
  it("is at the owner before a launch has begun", () => {
    expect(deployStepStates(undefined)).toEqual(["current", "todo", "todo", "todo"]);
  });

  it("is at the renderer once an owner is named and nothing is deployed", () => {
    expect(deployStepStates(base)).toEqual(["done", "current", "todo", "todo"]);
  });

  it("is at the collection once the renderer is deployed", () => {
    expect(
      deployStepStates({ ...base, status: "renderer", renderer: "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512" }),
    ).toEqual(["done", "done", "current", "todo"]);
  });

  it("is at the site's settings when both are deployed and checked, which is the last thing for the person to do", () => {
    expect(deployStepStates({ ...base, status: "done" })).toEqual(["done", "done", "done", "current"]);
  });
});
