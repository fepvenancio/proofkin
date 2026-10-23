import { tryReadCollection } from "@/chain/collection";
import { CollectionSummary } from "@/components/CollectionSummary";
import { CollectionUnavailable } from "@/components/CollectionUnavailable";
import { WalletButton } from "@/components/WalletButton";
import { requireAppConfig } from "@/config/env";

export const dynamic = "force-dynamic";

/**
 * @notice The home page, for now: the collection's state read from the chain, and the wallet button.
 * @dev A server component. The read happens here, through the server-only RPC URL, and only the finished HTML and
 * the wallet button's code reach the browser. A node that does not answer is a sentence on the page, not an error page,
 * and the cause is in the server log.
 */
export default async function Page() {
  const app = requireAppConfig();
  const state = await tryReadCollection(app);

  return (
    <main className="mx-auto max-w-3xl p-8">
      <header className="flex items-center justify-between">
        <h1 className="text-3xl font-semibold">Proofkin</h1>
        <WalletButton />
      </header>
      <div className="mt-8">
        {state ? (
          <CollectionSummary chainName={app.chain.name} state={state} />
        ) : (
          <CollectionUnavailable chainName={app.chain.name} />
        )}
      </div>
    </main>
  );
}
