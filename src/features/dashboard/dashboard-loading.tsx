import { Skeleton } from '@/src/components/ui/feedback';

export function DashboardLoading() {
  return <div className="dashboard-page dashboard-loading" aria-busy="true" aria-label="Loading profitability dashboard">
    <div className="dashboard-loading-heading"><Skeleton /><Skeleton /></div>
    <div className="dashboard-loading-health"><Skeleton /></div>
    <div className="primary-kpis">{Array.from({ length: 4 }, (_, index) => <div className="dashboard-kpi primary" key={index}><Skeleton /><Skeleton /><Skeleton /></div>)}</div>
    <div className="secondary-kpis">{Array.from({ length: 8 }, (_, index) => <div className="dashboard-kpi secondary" key={index}><Skeleton /><Skeleton /></div>)}</div>
    <div className="dashboard-section dashboard-loading-chart"><Skeleton /></div>
    <div className="dashboard-analysis-grid dashboard-loading-grid">{Array.from({ length: 2 }, (_, index) => <div className="dashboard-section dashboard-loading-panel" key={index}><Skeleton /><Skeleton /></div>)}</div>
    <div className="dashboard-product-grid dashboard-loading-grid">{Array.from({ length: 2 }, (_, index) => <div className="dashboard-section dashboard-loading-panel compact" key={index}><Skeleton /><Skeleton /></div>)}</div>
  </div>;
}
