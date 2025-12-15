export const supabaseQueries: any[] = [];
export const supabaseClientMock = {
  isMock: false,
  connect: async () => ({
    query: async (...args: any[]) => {
      supabaseQueries.push(args);
      return { rows: [] };
    },
    release: async () => undefined,
  }),
};