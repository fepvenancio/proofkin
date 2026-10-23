// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {Proofkin} from "../src/Proofkin.sol";
import {Renderer} from "../src/Renderer.sol";

/// @notice Deploys the renderer and the collection. Nothing else: the renderer is locked later, by the
///         owner, once the art has been reviewed (`lockRenderer`).
///
///         The owner must be named, so that who controls `setRenderer`, `lockRenderer` and `withdraw`
///         is never a side effect of whichever key sends the deployment:
///
///             PROOFKIN_OWNER=0x... forge script contracts/script/Deploy.s.sol --rpc-url ... --account ...
///
///         It deploys to a local chain, to Base Sepolia, and to Base mainnet, and refuses any other
///         chain, so a wrong RPC URL cannot put it somewhere unintended. Base mainnet also needs
///         PROOFKIN_CONFIRM_MAINNET=yes.
contract Deploy is Script {
    /// @dev 0.01 ETH, fixed in the contract's constructor from here: `mintPrice` is immutable.
    uint256 public constant MINT_PRICE = 0.01 ether;

    uint256 internal constant LOCAL = 31_337;
    uint256 internal constant BASE_SEPOLIA = 84_532;
    uint256 internal constant BASE = 8453;

    error OwnerRequired();
    error UnsupportedChain(uint256 chainId);
    error MainnetNotConfirmed();

    function run() external returns (Proofkin proofkin, Renderer renderer) {
        address owner = vm.envOr("PROOFKIN_OWNER", address(0));
        bytes32 confirmation = keccak256(bytes(vm.envOr("PROOFKIN_CONFIRM_MAINNET", string(""))));
        return deploy(owner, confirmation == keccak256("yes"));
    }

    /// @param owner Who administers the collection from the first block. Not the sender, unless it is.
    /// @param mainnetConfirmed Only consulted on Base mainnet.
    function deploy(address owner, bool mainnetConfirmed)
        public
        returns (Proofkin proofkin, Renderer renderer)
    {
        if (owner == address(0)) revert OwnerRequired();
        if (block.chainid != LOCAL && block.chainid != BASE_SEPOLIA && block.chainid != BASE) {
            revert UnsupportedChain(block.chainid);
        }
        if (block.chainid == BASE && !mainnetConfirmed) revert MainnetNotConfirmed();

        vm.startBroadcast();
        renderer = new Renderer();
        proofkin = new Proofkin(owner, address(renderer), MINT_PRICE);
        vm.stopBroadcast();

        console.log("Renderer:", address(renderer));
        console.log("Proofkin:", address(proofkin));
        console.log("Owner:   ", owner);
        console.log("Price (wei):", MINT_PRICE);
        // block.number is the latest block the script saw, at or before the one that holds the deployment.
        console.log(
            string.concat(
                "\nPlayground .env.local:\n",
                envBlock(block.chainid, address(proofkin), address(renderer), block.number)
            )
        );
        console.log(
            string.concat(
                "\nWeb app .env.local:\n",
                nextEnvBlock(block.chainid, address(proofkin), address(renderer), block.number)
            )
        );
    }

    /// @notice The lines the playground reads (packages/core/src/config.ts, prefix VITE_) to show this collection.
    function envBlock(uint256 chainId, address proofkin, address renderer, uint256 fromBlock)
        public
        pure
        returns (string memory)
    {
        return _envBlock("VITE_", chainId, proofkin, renderer, fromBlock);
    }

    /// @notice The same settings for the Next.js app (packages/web/src/config/env.ts, prefix NEXT_PUBLIC_).
    function nextEnvBlock(uint256 chainId, address proofkin, address renderer, uint256 fromBlock)
        public
        pure
        returns (string memory)
    {
        return _envBlock("NEXT_PUBLIC_", chainId, proofkin, renderer, fromBlock);
    }

    function _envBlock(
        string memory prefix,
        uint256 chainId,
        address proofkin,
        address renderer,
        uint256 fromBlock
    ) private pure returns (string memory) {
        string memory chain = chainId == BASE
            ? "base"
            : chainId == BASE_SEPOLIA ? "baseSepolia" : "anvil";
        return string.concat(
            prefix,
            "CHAIN=",
            chain,
            "\n",
            prefix,
            "PROOFKIN=",
            vm.toString(proofkin),
            "\n",
            prefix,
            "RENDERER=",
            vm.toString(renderer),
            "\n",
            prefix,
            "DEPLOY_BLOCK=",
            vm.toString(fromBlock)
        );
    }
}
