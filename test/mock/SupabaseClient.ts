export const supabaseQueries: any[] = [];
export const supabaseClientMock = {
  isConnected: true,
  query: async (...args: any[]) => {
    supabaseQueries.push(args);
    return { rows: [] };
  },
  connect: async () => ({
    query: async (...args: any[]) => {
      supabaseQueries.push(args);
      return { rows: [] };
    },
    release: async () => undefined,
    raw: undefined,
  }),
  withClient: async (fn: (client: any) => Promise<any>) => {
    const client = await supabaseClientMock.connect();
    try {
      return await fn(client);
    } finally {
      await client.release();
    }
  },
};
