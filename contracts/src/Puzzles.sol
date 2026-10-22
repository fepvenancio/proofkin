// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title Puzzles
/// @notice The six Proofkin puzzles: input/output shapes, seeded input generation and reference
///         solvers. Mirrored by `packages/vm/src/puzzles.ts`; the two must agree byte-for-byte.
///
/// | id | name        | inputs                                  | outputs |
/// |----|-------------|-----------------------------------------|---------|
/// | 0  | QUORUM7     | 7 votes (0..1), threshold t (1..7)      | 1       |
/// | 1  | MEDIAN5     | 5 values (0..255)                       | 1       |
/// | 2  | SORT8       | 8 values (0..255)                       | 8       |
/// | 3  | GRID_PATH   | 12 edge weights (0..15)                 | 1       |
/// | 4  | KNAPSACK3   | w0,v0,w1,v1,w2,v2 (w 1..20, v 0..50), cap (1..40) | 1 |
/// | 5  | FAIR_SPLIT4 | budget B (1..4000), r0..r3 (1..1000)    | 4       |
///
/// @dev GRID_PATH is a 3x3 grid of nodes walked from the top-left to the bottom-right with moves
///      right or down only. Its 12 inputs are edge weights in this order:
///        inputs 0..5  horizontal edges, row by row: (r,0)->(r,1) then (r,1)->(r,2) for r = 0,1,2
///        inputs 6..11 vertical edges, row by row:   (0,c)->(1,c) for c = 0,1,2, then (1,c)->(2,c)
library Puzzles {
    error UnknownPuzzle(uint256 puzzleId);
    error BadInputLength();

    uint256 internal constant PUZZLE_COUNT = 6;
    /// @dev Trials 0 and 1 are fixed edge cases; trials 2..9 are seeded-random.
    uint256 internal constant TRIALS = 10;

    uint256 internal constant QUORUM7 = 0;
    uint256 internal constant MEDIAN5 = 1;
    uint256 internal constant SORT8 = 2;
    uint256 internal constant GRID_PATH = 3;
    uint256 internal constant KNAPSACK3 = 4;
    uint256 internal constant FAIR_SPLIT4 = 5;

    function inputCount(uint256 id) internal pure returns (uint256) {
        if (id == QUORUM7) return 8;
        if (id == MEDIAN5) return 5;
        if (id == SORT8) return 8;
        if (id == GRID_PATH) return 12;
        if (id == KNAPSACK3) return 7;
        if (id == FAIR_SPLIT4) return 5;
        revert UnknownPuzzle(id);
    }

    function outputCount(uint256 id) internal pure returns (uint256) {
        if (id == SORT8) return 8;
        if (id == FAIR_SPLIT4) return 4;
        if (id < PUZZLE_COUNT) return 1;
        revert UnknownPuzzle(id);
    }

    /// @notice Inputs for one trial of a puzzle.
    /// @dev Trials 0 and 1 are fixed per puzzle and ignore `seed`. Every other trial is
    ///      `lo + uint256(keccak256(abi.encode(seed, trial, i))) % (hi - lo + 1)` for input `i`.
    function inputs(uint256 id, bytes32 seed, uint256 trial)
        internal
        pure
        returns (uint256[] memory x)
    {
        x = new uint256[](inputCount(id));
        if (trial < 2) {
            _fixed(id, trial, x);
            return x;
        }
        for (uint256 i; i < x.length; ++i) {
            (uint256 lo, uint256 hi) = _range(id, i);
            x[i] = lo + uint256(keccak256(abi.encode(seed, trial, i))) % (hi - lo + 1);
        }
    }

    /// @notice The correct outputs for `x`. Named `referenceOutputs` because `reference` is a
    ///         reserved word in Solidity; the TypeScript port calls it `reference`.
    function referenceOutputs(uint256 id, uint256[] memory x)
        internal
        pure
        returns (uint256[] memory out)
    {
        if (x.length != inputCount(id)) revert BadInputLength();

        if (id == QUORUM7) {
            uint256 votes;
            for (uint256 i; i < 7; ++i) {
                votes += x[i];
            }
            out = new uint256[](1);
            out[0] = votes >= x[7] ? 1 : 0;
        } else if (id == MEDIAN5) {
            out = new uint256[](1);
            out[0] = _sorted(x)[2];
        } else if (id == SORT8) {
            out = _sorted(x);
        } else if (id == GRID_PATH) {
            out = new uint256[](1);
            out[0] = _gridPath(x);
        } else if (id == KNAPSACK3) {
            out = new uint256[](1);
            out[0] = _knapsack3(x);
        } else {
            out = _fairSplit4(x);
        }
    }

    /// @dev Inclusive [lo, hi] of input `i`.
    function _range(uint256 id, uint256 i) private pure returns (uint256 lo, uint256 hi) {
        if (id == QUORUM7) return i < 7 ? (0, 1) : (1, 7);
        if (id == MEDIAN5 || id == SORT8) return (0, 255);
        if (id == GRID_PATH) return (0, 15);
        if (id == KNAPSACK3) return i == 6 ? (1, 40) : (i % 2 == 0 ? (1, 20) : (0, 50));
        return i == 0 ? (1, 4000) : (1, 1000); // FAIR_SPLIT4
    }

    /// @dev Fills `x` with the edge-case inputs of trial 0 or 1.
    function _fixed(uint256 id, uint256 trial, uint256[] memory x) private pure {
        bool first = trial == 0;
        uint256 n = x.length;
        if (id == QUORUM7) {
            // all votes 0 with t = 7, then all votes 1 with t = 1
            for (uint256 i; i < 7; ++i) {
                x[i] = trial;
            }
            x[7] = first ? 7 : 1;
        } else if (id == MEDIAN5) {
            // all equal, then strictly descending
            for (uint256 i; i < n; ++i) {
                x[i] = first ? 128 : 200 - 50 * i;
            }
        } else if (id == SORT8) {
            for (uint256 i; i < n; ++i) {
                x[i] = first ? 128 : 224 - 32 * i;
            }
        } else if (id == GRID_PATH) {
            for (uint256 i; i < n; ++i) {
                x[i] = first ? 0 : 15;
            }
        } else if (id == KNAPSACK3) {
            // every weight > cap, then every weight 1 with cap 40
            if (first) {
                (x[0], x[1], x[2], x[3], x[4], x[5], x[6]) = (6, 50, 10, 40, 20, 30, 5);
            } else {
                (x[0], x[1], x[2], x[3], x[4], x[5], x[6]) = (1, 10, 1, 20, 1, 30, 40);
            }
        } else {
            // FAIR_SPLIT4: sum == B exactly, then sum > B with every request 1000
            if (first) {
                (x[0], x[1], x[2], x[3], x[4]) = (1000, 100, 200, 300, 400);
            } else {
                (x[0], x[1], x[2], x[3], x[4]) = (3999, 1000, 1000, 1000, 1000);
            }
        }
    }

    /// @dev Ascending copy of `x` (insertion sort; at most 8 elements).
    function _sorted(uint256[] memory x) private pure returns (uint256[] memory s) {
        s = new uint256[](x.length);
        for (uint256 i; i < x.length; ++i) {
            uint256 v = x[i];
            uint256 j = i;
            while (j > 0 && s[j - 1] > v) {
                s[j] = s[j - 1];
                --j;
            }
            s[j] = v;
        }
    }

    function _gridPath(uint256[] memory x) private pure returns (uint256) {
        // d[3r + c] is the cheapest cost from (0,0) to (r,c).
        uint256[9] memory d;
        for (uint256 r; r < 3; ++r) {
            for (uint256 c; c < 3; ++c) {
                if (r == 0 && c == 0) continue;
                uint256 best = type(uint256).max;
                if (c > 0) best = d[3 * r + c - 1] + x[2 * r + c - 1]; // arrive from the left
                if (r > 0) {
                    uint256 fromAbove = d[3 * (r - 1) + c] + x[6 + 3 * (r - 1) + c];
                    if (fromAbove < best) best = fromAbove;
                }
                d[3 * r + c] = best;
            }
        }
        return d[8];
    }

    /// @dev x = w0, v0, w1, v1, w2, v2, cap.
    function _knapsack3(uint256[] memory x) private pure returns (uint256 best) {
        for (uint256 mask = 1; mask < 8; ++mask) {
            uint256 weight;
            uint256 value;
            for (uint256 i; i < 3; ++i) {
                if (mask & (1 << i) != 0) {
                    weight += x[2 * i];
                    value += x[2 * i + 1];
                }
            }
            if (weight <= x[6] && value > best) best = value;
        }
    }

    /// @dev x = B, r0..r3. Requests are >= 1, so the total is never 0.
    function _fairSplit4(uint256[] memory x) private pure returns (uint256[] memory out) {
        uint256 budget = x[0];
        uint256 total = x[1] + x[2] + x[3] + x[4];
        out = new uint256[](4);
        for (uint256 i; i < 4; ++i) {
            out[i] = total <= budget ? x[i + 1] : x[i + 1] * budget / total;
        }
    }
}
