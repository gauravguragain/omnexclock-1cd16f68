import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Mail } from "lucide-react";
import { useEventsData } from "./useEventsData";
import MenuShareDialog, { type MenuShareLead } from "./MenuShareDialog";

function Inner({ lead, onClose }: { lead: MenuShareLead & { business_id: string }; onClose: () => void }) {
  const d = useEventsData(lead.business_id);
  return <MenuShareDialog open onOpenChange={o => !o && onClose()} data={d as any} source="lead_menu" lead={lead} />;
}
export default function LeadMenuShareButton({ lead }: { lead: MenuShareLead & { business_id: string } }) {
  const [open, setOpen] = useState(false);
  return <><Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}><Mail className="mr-2 h-4 w-4" />Print / email menu</Button>{open && <Inner lead={lead} onClose={() => setOpen(false)} />}</>;
}
