import { OrganisationDetailPage } from '@/src/features/platform/organisation-detail-page';

export default async function Page({ params }: { params: Promise<{ organisationId: string }> }) {
  const { organisationId } = await params;
  return <OrganisationDetailPage organisationId={organisationId} />;
}
