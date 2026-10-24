import { OPERATIONS } from "@/features/solve/operations";

/**
 * @notice The thirteen operations a program is made of, folded away until wanted.
 * @dev The page already says how a program is written in its starting point, so this is a reference to open, not
 * something to read first. A server component: it is the same for everyone.
 */
export function OperationsReference() {
  return (
    <details className="mt-5 border-t border-rule pt-4">
      <summary className="cursor-pointer font-semibold">The thirteen operations</summary>
      <p className="mt-3 max-w-prose text-graphite">
        One node per line, written <code className="font-address">name = OP operands</code>, where an operand is the
        name of an earlier node. The last line is <code className="font-address">out</code> followed by one node per
        answer slot.
      </p>
      <table className="mt-3 w-full max-w-2xl border-collapse text-left">
        <tbody>
          {OPERATIONS.map((operation) => (
            <tr key={operation.name} className="border-b border-rule align-top">
              <td className="font-address py-2 pr-6 whitespace-nowrap">{operation.usage}</td>
              <td className="py-2 text-graphite">{operation.meaning}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}
