"use client";

import { envBlock, type Launched, verifyCommands } from "@proofkin/core/launch";
import { useState } from "react";
import { type Address } from "viem";

const link = "underline underline-offset-4";

/**
 * @notice What to do with a collection that has just been deployed: the settings that make the site show it, where to
 * look at it, and the commands that publish its source.
 * @dev (1) The settings are the ones Deploy.s.sol prints, so they are ones the site accepts. (2) Whether they were copied
 * is remembered against the text copied, so a block for another collection never reads "Copied". (3) The commands are
 * text to copy, for the owner to run with Foundry; nothing here verifies anything.
 * @param props - `launched`: where the contracts are. `owner`: who the collection was given to, which the commands name.
 * `explorer`: the chain's block explorer, if it has one. `onForget`: drops the console's note of this deployment from
 * this browser; without it there is no such button.
 */
export function DeployResult({
  launched,
  owner,
  explorer,
  onForget,
}: {
  launched: Launched;
  owner: Address;
  explorer?: string;
  onForget?: () => void;
}) {
  const settings = envBlock(launched);
  const commands = verifyCommands({
    chainId: launched.chainId,
    owner,
    proofkin: launched.proofkin,
    renderer: launched.renderer,
  });
  const [copied, setCopied] = useState<string>();

  return (
    <div className="space-y-4">
      {explorer && (
        <p className="flex flex-wrap gap-x-6 gap-y-2">
          <a href={`${explorer}/address/${launched.proofkin}`} className={link}>
            Collection on the explorer
          </a>
          <a href={`${explorer}/address/${launched.renderer}`} className={link}>
            Renderer on the explorer
          </a>
        </p>
      )}

      <div>
        <pre
          role="group"
          aria-label="Site settings"
          tabIndex={0}
          className="font-address overflow-x-auto rounded-[2px] border border-rule p-3 text-sm"
        >
          {settings}
        </pre>
        <button
          type="button"
          className={`${link} mt-2`}
          onClick={() => void navigator.clipboard?.writeText(settings).then(() => setCopied(settings))}
        >
          {copied === settings ? "Copied" : "Copy settings"}
        </button>
        <p className="mt-2 max-w-prose text-graphite">
          Put these in the site&apos;s environment and deploy the site again (add NEXT_PUBLIC_RPC_URL if you use your
          own node). Until then, this console remembers the collection in this browser.
        </p>
      </div>

      {commands && (
        <details>
          <summary className="cursor-pointer">Publish the source on Blockscout</summary>
          <p className="mt-2 max-w-prose text-graphite">
            Run these from the repository. They have not been tried against a real explorer.
          </p>
          <pre
            role="group"
            aria-label="Commands to publish the source"
            tabIndex={0}
            className="font-address mt-2 overflow-x-auto rounded-[2px] border border-rule p-3 text-sm"
          >
            {commands.join("\n")}
          </pre>
        </details>
      )}

      {onForget && (
        <button
          type="button"
          className="text-graphite underline underline-offset-4"
          onClick={() => {
            if (
              window.confirm(
                "This removes the console's note of where this collection is, in this browser only. The contracts stay on the chain, and the settings above still find them. Forget it?",
              )
            ) {
              onForget();
            }
          }}
        >
          Forget this deployment
        </button>
      )}
    </div>
  );
}
