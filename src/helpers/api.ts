import { fetch } from "cross-fetch";

import {
  HANDLE_API_ENDPOINT,
  HANDLE_ME_API_KEY,
  KORA_USER_AGENT,
} from "../constants/index.js";

const fetchApi = async (
  endpoint: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  params: any = {}
): Promise<Response> => {
  const { headers, ...rest } = params;
  const baseUrl = HANDLE_API_ENDPOINT;
  const url = `${baseUrl}/${endpoint}`;
  const apiKey = HANDLE_ME_API_KEY;

  const fetchHeaders = {
    ...headers,
    "User-Agent": KORA_USER_AGENT,
    "api-key": apiKey,
  };

  return fetch(url, {
    headers: fetchHeaders,
    ...rest,
  });
};

export { fetchApi };
