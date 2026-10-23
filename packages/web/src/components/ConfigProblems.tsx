/**
 * @notice What a misconfigured deploy shows instead of the app.
 * @dev A server component with no state, so the root layout can render it before any provider exists. It lists every
 * problem at once: the person fixing the environment should not have to redeploy once per variable.
 * @param props - `problems`: one sentence per problem, each naming the variable to fix.
 */
export function ConfigProblems({ problems }: { problems: string[] }) {
  return (
    <section role="alert" className="mx-auto max-w-2xl p-8">
      <h1 className="text-2xl font-semibold">Proofkin is not configured</h1>
      <p className="mt-4">
        Set these in the environment (see <code>.env.example</code>) and restart:
      </p>
      <ul className="mt-4 list-disc space-y-2 pl-6">
        {problems.map((problem) => (
          <li key={problem}>{problem}</li>
        ))}
      </ul>
    </section>
  );
}
