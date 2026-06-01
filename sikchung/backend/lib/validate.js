'use strict';

function validateRestricted(arr) {
  if (!Array.isArray(arr))                      return 'restricted must be an array';
  if (arr.length !== 12)                        return 'restricted must have exactly 12 elements';
  if (!arr.every(x => typeof x === 'boolean'))  return 'restricted elements must be boolean';
  return null;
}

module.exports = { validateRestricted };
