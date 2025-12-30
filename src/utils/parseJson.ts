export const parseMaybeJson = (input: string | undefined) => {
  if (!input) return null;
  try {
    return JSON.parse(input);
  } catch {
    return input;
  }
};
