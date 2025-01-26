const getAllHandles = async (): Promise<string[]> => {
  const response = await fetch("https://api.handle.me/handles", {
    headers: {
      Accept: "text/plain",
    },
  });
  return (await response.text()).split("\n");
};

export { getAllHandles };
