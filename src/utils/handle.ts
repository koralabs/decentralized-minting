/**
 * @description Get the price of a handle
 * @param {string} handle Handle
 * @returns {bigint} Price
 */
const getHandlePrice = (handle: string): bigint => {
  const handleLength = handle.length;
  if (handleLength <= 1)
    throw new Error("Handle must be at least 2 characters");
  // ultra rare: 2_000 ada
  if (handleLength <= 2) return 2_000_000_000n;
  // rare: 500 ada
  if (handleLength <= 3) return 500_000_000n;
  // common: 100 ada
  if (handleLength <= 7) return 100_000_000n;
  // basic: 10 ada
  if (handleLength <= 15) return 10_000_000n;

  throw new Error("Handle is too long");
};

export { getHandlePrice };
