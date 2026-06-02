import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Mail } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { logAudit, getDeviceInfo } from "@/lib/auditLog";

interface EmailPDFDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pdfBase64: string;
  pdfFilename: string;
  subject: string;
  businessName?: string;
  skipAudit?: boolean;
}

export function EmailPDFDialog({ open, onOpenChange, pdfBase64, pdfFilename, subject, businessName, skipAudit }: EmailPDFDialogProps) {
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);

  const handleSend = async () => {
    if (!email.trim()) {
      toast.error("Please enter an email address");
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      toast.error("Please enter a valid email address");
      return;
    }
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-email", {
        body: {
          type: "report_pdf",
          to: email.trim(),
          subject,
          pdfBase64,
          pdfFilename,
          businessName,
        },
      });
      if (error) throw error;
      if (data?.success === false) throw new Error(data.error || "Failed to send email");
      toast.success(`Report sent to ${email.trim()}`);
      if (!skipAudit) {
        logAudit("pdf_email_sent", {
          recipient_email: email.trim(),
          subject,
          filename: pdfFilename,
          device: getDeviceInfo(),
        });
      }
      setEmail("");
      onOpenChange(false);
    } catch (err: any) {
      toast.error("Failed to send email: " + (err.message || "Unknown error"));
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-primary" />
            Email PDF Report
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Recipient Email</Label>
            <Input
              type="email"
              placeholder="Enter email address..."
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSend()}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Subject</Label>
            <p className="text-sm text-foreground">{subject}</p>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Attachment</Label>
            <p className="text-sm text-foreground">{pdfFilename}</p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSend} disabled={sending}>
            <Mail className="mr-1.5 h-4 w-4" />
            {sending ? "Sending..." : "Send Email"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
