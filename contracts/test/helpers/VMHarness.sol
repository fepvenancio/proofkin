// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {VM} from "../../src/VM.sol";

/// @dev External wrapper so `vm.expectRevert` and try/catch can observe the library's reverts.
contract VMHarness {
    function validate(bytes memory program) external pure {
        VM.validate(program);
    }

    function run(bytes memory program, uint256[] memory inputs)
        external
        pure
        returns (bool ok, uint256[] memory outputs, uint256[] memory values)
    {
        return VM.run(program, inputs);
    }
}
