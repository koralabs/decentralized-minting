import { IS_PRODUCTION } from "@koralabs/kora-labs-common";
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
  const apiKey = IS_PRODUCTION ? "" : HANDLE_ME_API_KEY;

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

const fetchApiJson = async <T>(
  endpoint: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  params: any = {}
): Promise<T> => {
  params.headers = {
    ...params.headers,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  const response = await fetchApi(endpoint, params);
  return response.json();
};

export { fetchApi, fetchApiJson };
