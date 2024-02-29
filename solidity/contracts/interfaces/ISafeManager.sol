// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.19;

interface ISafeManager {
    // --- Job ---
    function safeData(
        uint256 _safeId
    )
        external
        view
        returns (address _owner, address pendingOwner, address _safeHandler, bytes32 _collateralType);
}
