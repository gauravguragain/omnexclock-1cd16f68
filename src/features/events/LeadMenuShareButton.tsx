import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Mail } from "lucide-react";
import { useEventsData } from "./useEventsData";
import MenuShareDialog, { type MenuShareLead } from "./MenuShareDialog";

function Inner({ lead, onClose, menuCategory }: { menuCategory?: "event" | "catering"; lead: MenuShareLead & { business_id: string }; onClose: () => void }) {
  const d = useEventsData(lead.business_id);
  return <MenuShareDialog open onOpenChange={o => !o && onClose()} data={d as any} source="lead_menu" lead={lead} menuCategory={menuCategory} />;
}
export default function LeadMenuShareButton({ lead, menuCategory }: { menuCategory?: "event" | "catering"; lead: MenuShareLead & { business_id: string } }) {
  const [open, setOpen] = useState(false);
  return <><Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}><Mail className="mr-2 h-4 w-4" />Print / email menu</Button>{open && <Inner lead={lead} menuCategory={menuCategory} onClose={() => setOpen(false)} />}</>;
}
