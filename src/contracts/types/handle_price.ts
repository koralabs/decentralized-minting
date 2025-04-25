type HandlePriceData = bigint[];

type HandlePriceInfo = {
  current_data: HandlePriceData;
  prev_data: HandlePriceData;
  updated_at: bigint;
};

export type { HandlePriceData, HandlePriceInfo };
