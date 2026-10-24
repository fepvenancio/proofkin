import { Fragment } from "react";

import { describeTraits } from "@/model/traits";

/**
 * @notice A token's traits as terms and values.
 * @dev A definition list, not a row of badges: the traits are facts about one token, read top to bottom. The one live
 * trait says beside itself that it can change.
 * @param props - `attributes`: what `tokenURI` listed.
 */
export function TraitList({ attributes }: { attributes: { trait: string; value: string | number }[] }) {
  return (
    <dl className="grid grid-cols-[minmax(9rem,max-content)_1fr] gap-x-8 gap-y-3">
      {describeTraits(attributes).map((row) => (
        <Fragment key={row.label}>
          <dt className="text-graphite">{row.label}</dt>
          <dd className="tabular-nums">
            <span>{row.value}</span>
            {row.note && <p className="mt-0.5 max-w-prose text-sm text-graphite">{row.note}</p>}
          </dd>
        </Fragment>
      ))}
    </dl>
  );
}
