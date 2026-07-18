export const fileFromTitle = (title: string): string => {
  return title.replace(/[*+]/, "");
};
