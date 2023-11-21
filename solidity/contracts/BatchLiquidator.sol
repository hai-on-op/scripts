// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {ILiquidationJob} from "./interfaces/ILiquidationJob.sol";
import {ISafeManager} from "./interfaces/ISafeManager.sol";

// this contract is used to batch liquidate multiple positions
contract BatchLiquidator {
    // this struct is used to store the result of each liquidation
    struct Data {
        bool succeed;
        bytes32 collateralType;
        address safeHandler;
    }

    constructor(
        ILiquidationJob _liquidationJob,
        ISafeManager _safeManager,
        uint256[] memory _safeIds
    ) {
        // create an array where the return data is going to be stored
        Data[] memory _result = new Data[](_safeIds.length);

        // try to liquidate each position
        for (uint256 _i = 0; _i < _safeIds.length; _i++) {
            bool _succeed;

            // get params from the safe manager
            (, , address _safeHandler, bytes32 _collateralType) = _safeManager
                .safeData(_safeIds[_i]);

            // call the liquidation job
            try _liquidationJob.workLiquidation(_collateralType, _safeHandler) {
                _succeed = true;
            } catch {
                _succeed = false;
            }

            // store the result
            _result[_i] = Data({
                succeed: _succeed,
                collateralType: _collateralType,
                safeHandler: _safeHandler
            });
        }

        // encode the return data
        bytes memory _data = abi.encode(_result);

        // force constructor to return data via assembly
        assembly {
            // abi.encode adds an additional offset (32 bytes) that we need to skip
            let _dataStart := add(_data, 32)
            // msize() gets the size of active memory in bytes.
            // if we subtract msize() from _dataStart, the output will be
            // the amount of bytes from _dataStart to the end of memory
            // which due to how the data has been laid out in memory, will coincide with
            // where our desired data ends.
            let _dataEnd := sub(msize(), _dataStart)
            // starting from _dataStart, get all the data in memory.
            return(_dataStart, _dataEnd)
        }
    }
}
