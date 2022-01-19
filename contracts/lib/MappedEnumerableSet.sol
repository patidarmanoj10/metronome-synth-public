// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

/**
 * @dev Library for managing
 * https://en.wikipedia.org/wiki/Set_(abstract_data_type)[sets] of primitive
 * types.
 *
 * Sets have the following properties:
 *
 * - Elements are added, removed, and checked for existence in constant time
 * (O(1)).
 * - Elements are enumerated in O(n). No guarantees are made on the ordering.
 *
 * ```
 * contract Example {
 *     // Add the library methods
 *     using EnumerableSet for EnumerableSet.Set;
 *
 *     // Declare a set state variable
 *     EnumerableSet.Set private mySet;
 * }
 * ```
 *
 * As of v3.3.0, sets of type `bytes32` (`Bytes32Set`), `address` (`Set`)
 * and `uint256` (`UintSet`) are supported.
 */
library MappedEnumerableSet {
    // To implement this library for multiple types with as little code
    // repetition as possible, we write it in terms of a generic Set type with
    // bytes32 values.
    // The Set implementation uses private functions, and user-facing
    // implementations (such as Set) are just wrappers around the
    // underlying Set.
    // This means that we can only create new EnumerableSets for types that fit
    // in bytes32.

    struct Set {
        // Storage of set values
        address[] _values;
        // Position of the value in the `values` array, plus 1 because index 0
        // means a value is not in the set.
        mapping(address => uint256) _indexes;
    }

    struct AddressSet {
        mapping(address => Set) _ofAddress;
    }

    /**
     * @dev Add a value to a set. O(1).
     *
     * Returns true if the value was added to the set, that is if it was not
     * already present.
     */
    function _add(
        AddressSet storage set,
        address _key,
        address value
    ) private returns (bool) {
        if (!_contains(set, _key, value)) {
            set._ofAddress[_key]._values.push(value);
            // The value is stored at length-1, but we add 1 to all indexes
            // and use 0 as a sentinel value
            set._ofAddress[_key]._indexes[value] = set._ofAddress[_key]._values.length;
            return true;
        } else {
            return false;
        }
    }

    /**
     * @dev Removes a value from a set. O(1).
     *
     * Returns true if the value was removed from the set, that is if it was
     * present.
     */
    function _remove(
        AddressSet storage set,
        address _key,
        address value
    ) private returns (bool) {
        // We read and store the value's index to prevent multiple reads from the same storage slot
        uint256 valueIndex = set._ofAddress[_key]._indexes[value];

        if (valueIndex != 0) {
            // Equivalent to contains(set, value)
            // To delete an element from the _values array in O(1), we swap the element to delete with the last one in
            // the array, and then remove the last element (sometimes called as 'swap and pop').
            // This modifies the order of the array, as noted in {at}.

            uint256 toDeleteIndex = valueIndex - 1;
            uint256 lastIndex = set._ofAddress[_key]._values.length - 1;

            if (lastIndex != toDeleteIndex) {
                address lastvalue = set._ofAddress[_key]._values[lastIndex];

                // Move the last value to the index where the value to delete is
                set._ofAddress[_key]._values[toDeleteIndex] = lastvalue;
                // Update the index for the moved value
                set._ofAddress[_key]._indexes[lastvalue] = valueIndex; // Replace lastvalue's index to valueIndex
            }

            // Delete the slot where the moved value was stored
            set._ofAddress[_key]._values.pop();

            // Delete the index for the deleted slot
            delete set._ofAddress[_key]._indexes[value];

            return true;
        } else {
            return false;
        }
    }

    /**
     * @dev Returns true if the value is in the set. O(1).
     */
    function _contains(
        AddressSet storage set,
        address _key,
        address value
    ) private view returns (bool) {
        return set._ofAddress[_key]._indexes[value] != 0;
    }

    /**
     * @dev Returns the number of values on the set. O(1).
     */
    function _length(AddressSet storage set, address _key) private view returns (uint256) {
        return set._ofAddress[_key]._values.length;
    }

    /**
     * @dev Returns the value stored at position `index` in the set. O(1).
     *
     * Note that there are no guarantees on the ordering of values inside the
     * array, and it may change when more values are added or removed.
     *
     * Requirements:
     *
     * - `index` must be strictly less than {length}.
     */
    function _at(
        AddressSet storage set,
        address _key,
        uint256 index
    ) private view returns (address) {
        return set._ofAddress[_key]._values[index];
    }

    /**
     * @dev Return the entire set in an array
     *
     * WARNING: This operation will copy the entire storage to memory, which can be quite expensive. This is designed
     * to mostly be used by view accessors that are queried without any gas fees. Developers should keep in mind that
     * this function has an unbounded cost, and using it as part of a state-changing function may render the function
     * uncallable if the set grows to a point where copying to memory consumes too much gas to fit in a block.
     */
    function _values(AddressSet storage set, address _key) private view returns (address[] memory) {
        return set._ofAddress[_key]._values;
    }

    /**
     * @dev Add a value to a set. O(1).
     *
     * Returns true if the value was added to the set, that is if it was not
     * already present.
     */
    function add(
        AddressSet storage set,
        address key,
        address value
    ) internal returns (bool) {
        return _add(set, key, value);
    }

    /**
     * @dev Removes a value from a set. O(1).
     *
     * Returns true if the value was removed from the set, that is if it was
     * present.
     */
    function remove(
        AddressSet storage set,
        address key,
        address value
    ) internal returns (bool) {
        return _remove(set, key, value);
    }

    /**
     * @dev Returns true if the value is in the set. O(1).
     */
    function contains(
        AddressSet storage set,
        address key,
        address value
    ) internal view returns (bool) {
        return _contains(set, key, value);
    }

    /**
     * @dev Returns the number of values in the set. O(1).
     */
    function length(AddressSet storage set, address key) internal view returns (uint256) {
        return _length(set, key);
    }

    /**
     * @dev Returns the value stored at position `index` in the set. O(1).
     *
     * Note that there are no guarantees on the ordering of values inside the
     * array, and it may change when more values are added or removed.
     *
     * Requirements:
     *
     * - `index` must be strictly less than {length}.
     */
    function at(
        AddressSet storage set,
        address key,
        uint256 index
    ) internal view returns (address) {
        return _at(set, key, index);
    }

    /**
     * @dev Return the entire set in an array
     *
     * WARNING: This operation will copy the entire storage to memory, which can be quite expensive. This is designed
     * to mostly be used by view accessors that are queried without any gas fees. Developers should keep in mind that
     * this function has an unbounded cost, and using it as part of a state-changing function may render the function
     * uncallable if the set grows to a point where copying to memory consumes too much gas to fit in a block.
     */
    function values(AddressSet storage set, address key) internal view returns (address[] memory) {
        address[] memory store = _values(set, key);
        address[] memory result;

        assembly {
            result := store
        }

        return result;
    }
}
