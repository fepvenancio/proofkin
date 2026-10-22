#!/bin/bash
# Independent known-answer vectors for Puzzles.inputs, computed with `cast keccak` and python bigints
# instead of the TS or Solidity code under test:
#
#   tools/known_answers.sh <seed bytes32> <trial> <lo,hi> <lo,hi> ...
#
# prints inputs[i] = lo + uint256(keccak256(abi.encode(seed, trial, i))) % (hi - lo + 1), e.g. for KNAPSACK3:
#
#   tools/known_answers.sh 0x00..01 2 1,20 0,50 1,20 0,50 1,20 0,50 1,40
#
# The vectors pinned in packages/vm/test/puzzles.test.ts and contracts/test/Puzzles.t.sol came from here.
set -euo pipefail

seed=$1
trial=$2
shift 2

i=0
out=()
for range in "$@"; do
  lo=${range%,*}
  hi=${range#*,}
  h=$(cast keccak "$(cast abi-encode 'f(bytes32,uint256,uint256)' "$seed" "$trial" "$i")")
  out+=("$(python3 -c "print($lo + int('$h', 16) % ($hi - $lo + 1))")")
  i=$((i + 1))
done
echo "[${out[*]}]" | sed 's/ /, /g'
