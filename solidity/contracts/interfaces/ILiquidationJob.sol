// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.19;

interface ILiquidationJob {
    // --- Job ---
    function workLiquidation(bytes32 _cType, address _safe) external;
}
