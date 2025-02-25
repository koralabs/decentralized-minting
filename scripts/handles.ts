import { fetchApi } from "../src/index.js";

const getAllHandles = async (): Promise<string[]> => {
  const response = await fetchApi(`handles`, {
    headers: {
      Accept: "text/plain",
    },
  });
  if (!response.ok) throw new Error("Failed to fetch handles");
  const allHandlesText = await response.text();
  return allHandlesText.split("\n");
};

export { getAllHandles };
