import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Mail } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

interface EmailCSVDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  csvData: string;
  csvFilename: string;
  subject: string;
}

export function EmailCSVDialog({ open, onOpenChange, csvData, csvFilename, subject }: EmailCSVDialogProps) {
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
          type: "csv_export",
          recipientEmail: email.trim(),
          subject,
          csvData,
          csvFilename,
        },
      });
      if (error) throw error;
      if (data?.success === false) throw new Error(data.error || "Failed to send email");
      toast.success(`Report sent to ${email.trim()}`);
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
            Email Report
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
            <p className="text-sm text-foreground">{csvFilename}</p>
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
