import type { DashboardRepositoryInput } from '@/src/domain/analytics';
import type { COGSRecord, Marketplace, Product } from '@/src/domain/models';
import type {
  CreateProductGroupInput,
  ProductGroupActor,
  ProductGroupAuditEvent,
  ProductGroupCostProposal,
  ProductGroupCostProposalInput,
  ProductGroupDetail,
  ProductGroupListQuery,
  ProductGroupListResult,
  ProductGroupMembershipChangeInput,
  ResolvedProductCogs,
} from '@/src/domain/product-groups';

export type ProductGroupListRepositoryInput = DashboardRepositoryInput & ProductGroupListQuery;

export type ProductGroupDetailRepositoryInput = DashboardRepositoryInput & {
  groupId: string;
  /** ISO date used for effective-dated costs and membership. */
  asOf?: string;
};

export type CreateProductGroupRepositoryInput = DashboardRepositoryInput
  & CreateProductGroupInput
  & { actor: ProductGroupActor };

export type CreateProductGroupCostProposalRepositoryInput = DashboardRepositoryInput
  & ProductGroupCostProposalInput
  & { actor: ProductGroupActor };

export type ChangeProductGroupMembershipRepositoryInput = DashboardRepositoryInput
  & ProductGroupMembershipChangeInput
  & { actor: ProductGroupActor };

export interface ProductGroupProductOption {
  product: Product;
  listingCount: number;
  marketplaces: Marketplace[];
  marketplaceAccountIds: string[];
  activeGroupId: string | null;
  activeGroupName: string | null;
}

export interface ProductGroupProductSearchInput extends DashboardRepositoryInput {
  companyId: string;
  search?: string;
  asOf?: string;
  /** Retains this Group's own members while excluding other active Groups. */
  groupId?: string;
  limit?: number;
}

export interface ProductGroupResolvedProductCost {
  groupId: string | null;
  groupName: string | null;
  resolution: ResolvedProductCogs;
}

export interface ProductGroupRepository {
  list(input: ProductGroupListRepositoryInput, signal?: AbortSignal): Promise<ProductGroupListResult>;
  getById(input: ProductGroupDetailRepositoryInput, signal?: AbortSignal): Promise<ProductGroupDetail | null>;
  searchCompanyProducts(input: ProductGroupProductSearchInput, signal?: AbortSignal): Promise<ProductGroupProductOption[]>;
  create(input: CreateProductGroupRepositoryInput, signal?: AbortSignal): Promise<ProductGroupDetail>;
  createCostProposal(input: CreateProductGroupCostProposalRepositoryInput, signal?: AbortSignal): Promise<ProductGroupCostProposal>;
  applyCostProposal(
    input: DashboardRepositoryInput,
    proposalId: string,
    actor: ProductGroupActor,
    canApprove: boolean,
    signal?: AbortSignal,
  ): Promise<ProductGroupCostProposal>;
  changeMembership(input: ChangeProductGroupMembershipRepositoryInput, signal?: AbortSignal): Promise<ProductGroupDetail>;
  resolveProductCost(
    input: DashboardRepositoryInput,
    productId: string,
    onDate: string,
    signal?: AbortSignal,
  ): Promise<ProductGroupResolvedProductCost | null>;
  recordDirectOverride(
    input: DashboardRepositoryInput,
    record: COGSRecord,
    actor: ProductGroupActor,
    signal?: AbortSignal,
  ): Promise<ProductGroupAuditEvent | null>;
  getAuditEvents(input: DashboardRepositoryInput, groupId?: string, signal?: AbortSignal): Promise<ProductGroupAuditEvent[]>;
}
