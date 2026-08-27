import type { AnalysisContext } from '@/src/domain/models';

export const queryKeys = {
  products: {
    root: (organisationId: string) => ['products', organisationId] as const,
    list: (input: {
      context: AnalysisContext;
      search: string;
      page: number;
      pageSize: number;
      realmKey: string;
    }) => ['products', 'list', input] as const,
  },
};
