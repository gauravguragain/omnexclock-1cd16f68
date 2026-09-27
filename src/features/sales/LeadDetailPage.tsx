import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCrmData } from "./useCrmData";
import { LeadDetailView } from "./LeadDetailDialog";

export default function LeadDetailPage() {
  const { businessCode, leadId } = useParams();
  const [params] = useSearchParams();
  const crm = useCrmData();
  const navigate = useNavigate();
  if (!crm.business) return <div className="py-20 text-center text-muted-foreground">{crm.loading ? "Loading…" : "Not available."}</div>;
  const lead: any = crm.leads.find(l => l.id === leadId);
  if (!lead) return <div className="py-20 text-center text-muted-foreground">{crm.loading ? "Loading…" : <>Lead not found. <Link to={`/b/${businessCode}/events/leads/events`} className="text-primary">Back to leads</Link></>}</div>;
  const booking = crm.bookings.find(b => b.lead_id === leadId);
  return <div className="pb-10">
    <div className="px-4 pt-4 sm:px-5"><Button variant="ghost" size="sm" onClick={() => navigate(-1)}><ChevronLeft className="mr-1 h-4 w-4" />Back</Button></div>
    <LeadDetailView lead={lead} open initialTab={params.get("tab") || undefined} options={crm.options} interactions={crm.interactions} inspections={crm.inspections} tasks={crm.tasks} menuItems={crm.menuItems} booking={booking} businessName={crm.business.name} onSaved={crm.refresh} />
  </div>;
}
