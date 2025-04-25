/**
 * Returns the smallest of the given bigint values.
 * 
 * @param values - One or more bigint values
 * @returns The smallest of the given values
 * @throws {Error} If no values are provided
 */
export const minBigInt = (...values: bigint[]): bigint => {
  if (values.length === 0) {
    throw new Error('At least one value must be provided');
  }
  return values.reduce((min, current) => current < min ? current : min);
};

/**
 * Returns the largest of the given bigint values.
 * 
 * @param values - One or more bigint values
 * @returns The largest of the given values
 * @throws {Error} If no values are provided
 */
export const maxBigInt = (...values: bigint[]): bigint => {
  if (values.length === 0) {
    throw new Error('At least one value must be provided');
  }
  return values.reduce((max, current) => current > max ? current : max);
}; 