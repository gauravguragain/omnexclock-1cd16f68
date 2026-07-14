import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CreditCard, Save, Shield } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Props {
  employeeCode: string | null;
  businessCode: string | null;
}

const digitsOnly = (v: string) => v.replace(/\D/g, "");
const fmtABN = (abn: string) => {
  const d = digitsOnly(abn);
  if (d.length !== 11) return d;
  return `${d.slice(0, 2)} ${d.slice(2, 5)} ${d.slice(5, 8)} ${d.slice(8, 11)}`;
};

export default function PaymentDetailsSection({ employeeCode, businessCode }: Props) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [abn, setAbn] = useState("");
  const [accountName, setAccountName] = useState("");
  const [bsb, setBsb] = useState("");
  const [accountNumber, setAccountNumber] = useState("");

  useEffect(() => {
    if (!employeeCode || !businessCode) return;
    (async () => {
      setLoading(true);
      const { data } = await supabase.rpc("get_my_payment_details", {
        _employee_code: employeeCode,
        _business_code: businessCode,
      });
      const row = Array.isArray(data) ? data[0] : null;
      if (row) {
        setAbn(row.abn || "");
        setAccountName(row.account_name || "");
        setBsb(row.bsb || "");
        setAccountNumber(row.account_number || "");
      }
      setLoading(false);
    })();
  }, [employeeCode, businessCode]);

  const save = async () => {
    const abnDigits = digitsOnly(abn);
    if (abnDigits && abnDigits.length !== 11) {
      toast({ title: "Invalid ABN", description: "ABN must be exactly 11 digits.", variant: "destructive" });
      return;
    }
    setSaving(true);
    const { data, error } = await supabase.rpc("update_my_payment_details", {
      _employee_code: employeeCode!,
      _business_code: businessCode!,
      _abn: abnDigits || null,
      _account_name: accountName || null,
      _bsb: bsb || null,
      _account_number: accountNumber || null,
    });
    setSaving(false);
    if (error || data === false) {
      toast({ title: "Save failed", description: error?.message || "Could not update details.", variant: "destructive" });
      return;
    }
    toast({ title: "Payment details saved", description: "Your ABN and bank details have been updated." });
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <CreditCard className="h-4 w-4 text-primary" /> Payment Details
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Used to generate your weekly invoices. Keep these details accurate — invoices are issued each Monday for the previous week.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label className="text-xs">ABN (11 digits)</Label>
            <Input
              inputMode="numeric"
              placeholder="e.g. 12 345 678 901"
              value={abn}
              onChange={(e) => setAbn(e.target.value)}
              onBlur={() => setAbn(fmtABN(abn))}
              maxLength={14}
            />
          </div>
          <div className="space-y-2">
            <Label className="text-xs">Account Name</Label>
            <Input value={accountName} onChange={(e) => setAccountName(e.target.value)} placeholder="Full name on your bank account" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label className="text-xs">BSB</Label>
              <Input inputMode="numeric" placeholder="e.g. 062-000" value={bsb} onChange={(e) => setBsb(e.target.value)} maxLength={10} />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Account Number</Label>
              <Input inputMode="numeric" value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} maxLength={20} />
            </div>
          </div>

          <Button className="w-full" onClick={save} disabled={loading || saving}>
            <Save className="mr-1.5 h-4 w-4" />
            {saving ? "Saving..." : "Save Payment Details"}
          </Button>

          <div className="rounded-lg bg-secondary/50 border border-border/60 p-3 flex gap-2">
            <Shield className="h-3.5 w-3.5 text-primary flex-shrink-0 mt-0.5" />
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              These details are stored securely and only visible to you and your business's Super Admin. Contact your admin if you need help.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
