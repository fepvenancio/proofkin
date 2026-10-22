// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @dev Byte-level program builders for tests. Header fields are derived from the nodes and outputs.
library Prog {
    uint8 internal constant IN = 0;
    uint8 internal constant CONST = 1;
    uint8 internal constant ADD = 2;
    uint8 internal constant SUB = 3;
    uint8 internal constant MUL = 4;
    uint8 internal constant DIV = 5;
    uint8 internal constant MIN = 6;
    uint8 internal constant MAX = 7;
    uint8 internal constant LT = 8;
    uint8 internal constant EQ = 9;
    uint8 internal constant AND = 10;
    uint8 internal constant OR = 11;
    uint8 internal constant SEL = 12;

    uint8 internal constant QUORUM7 = 0; // 8 inputs, 1 output
    uint8 internal constant SORT8 = 2; // 8 inputs, 8 outputs

    function node(uint8 op, uint8 a, uint8 b, uint8 c) internal pure returns (bytes memory) {
        return abi.encodePacked(op, a, b, c);
    }

    /// @dev CONST node holding `value` (0..65535).
    function konst(uint256 value) internal pure returns (bytes memory) {
        return abi.encodePacked(CONST, uint8(value >> 8), uint8(value), uint8(0));
    }

    function build(uint8 puzzle, bytes memory nodes, bytes memory outs)
        internal
        pure
        returns (bytes memory)
    {
        return abi.encodePacked(
            uint8(1), puzzle, uint8(nodes.length / 4), uint8(outs.length), nodes, outs
        );
    }

    function out(uint8 a) internal pure returns (bytes memory) {
        return abi.encodePacked(a);
    }

    /// @dev `count` output slots alternating between node `a` and node `b`.
    function alt(uint8 a, uint8 b, uint256 count) internal pure returns (bytes memory o) {
        o = new bytes(count);
        for (uint256 i; i < count; ++i) {
            o[i] = bytes1(i % 2 == 0 ? a : b);
        }
    }

    /// @dev `n` nodes: CONST 1, then ADD(previous, node 0) repeatedly. Depth of node i is i.
    function addChain(uint256 n) internal pure returns (bytes memory nodes) {
        nodes = konst(1);
        for (uint256 i = 1; i < n; ++i) {
            nodes = bytes.concat(nodes, node(ADD, uint8(i - 1), 0, 0));
        }
    }

    /// @dev A seed whose byte `index` (0 = leftmost) is `value` and every other byte is 0.
    function seedWithByte(uint256 index, uint8 value) internal pure returns (bytes32) {
        return bytes32(uint256(value) << (8 * (31 - index)));
    }
}
