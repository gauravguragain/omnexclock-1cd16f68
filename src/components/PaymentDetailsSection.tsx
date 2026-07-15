import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CreditCard, Save, Shield, Pencil, Lock, X } from "lucide-react";
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

interface SavedDetails {
  abn: string;
  account_name: string;
  bsb: string;
  account_number: string;
}

export default function PaymentDetailsSection({ employeeCode, businessCode }: Props) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState<SavedDetails>({ abn: "", account_name: "", bsb: "", account_number: "" });
  const [abn, setAbn] = useState("");
  const [accountName, setAccountName] = useState("");
  const [bsb, setBsb] = useState("");
  const [accountNumber, setAccountNumber] = useState("");

  const load = async () => {
    if (!employeeCode || !businessCode) return;
    setLoading(true);
    const { data } = await supabase.rpc("get_my_payment_details", {
      _employee_code: employeeCode,
      _business_code: businessCode,
    });
    const row = Array.isArray(data) ? data[0] : null;
    const next: SavedDetails = {
      abn: row?.abn || "",
      account_name: row?.account_name || "",
      bsb: row?.bsb || "",
      account_number: row?.account_number || "",
    };
    setSaved(next);
    setAbn(next.abn ? fmtABN(next.abn) : "");
    setAccountName(next.account_name);
    setBsb(next.bsb);
    setAccountNumber(next.account_number);
    // Start locked when any details already exist; auto-open when nothing saved
    const hasAny = !!(next.abn || next.account_name || next.bsb || next.account_number);
    setEditing(!hasAny);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employeeCode, businessCode]);

  const cancelEdit = () => {
    setAbn(saved.abn ? fmtABN(saved.abn) : "");
    setAccountName(saved.account_name);
    setBsb(saved.bsb);
    setAccountNumber(saved.account_number);
    setEditing(false);
  };

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
    toast({ title: "Payment details saved", description: "Your details are now locked. Tap Edit to change them." });
    setSaved({
      abn: abnDigits,
      account_name: accountName,
      bsb,
      account_number: accountNumber,
    });
    setEditing(false);
  };

  const hasAny = !!(saved.abn || saved.account_name || saved.bsb || saved.account_number);

  const Row = ({ label, value }: { label: string; value: string }) => (
    <div className="flex items-start justify-between gap-3 py-1.5 border-b border-border/40 last:border-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm font-mono text-foreground text-right break-all">{value || "—"}</span>
    </div>
  );

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-base flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-primary" /> Payment Details
              {!editing && hasAny && <Lock className="h-3.5 w-3.5 text-muted-foreground" />}
            </CardTitle>
            {!editing && hasAny && (
              <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
                <Pencil className="mr-1.5 h-3.5 w-3.5" /> Edit
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Used to generate your weekly invoices. Locked after save to prevent accidental edits — tap Edit to update.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
            <p className="text-xs text-muted-foreground">Loading…</p>
          ) : !editing ? (
            <div className="rounded-lg bg-secondary/40 border border-border/60 p-3">
              <Row label="ABN" value={saved.abn ? fmtABN(saved.abn) : ""} />
              <Row label="Account Name" value={saved.account_name} />
              <Row label="BSB" value={saved.bsb} />
              <Row label="Account Number" value={saved.account_number} />
            </div>
          ) : (
            <>
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

              <div className="flex gap-2">
                <Button className="flex-1" onClick={save} disabled={saving}>
                  <Save className="mr-1.5 h-4 w-4" />
                  {saving ? "Saving..." : "Save & Lock"}
                </Button>
                {hasAny && (
                  <Button variant="outline" onClick={cancelEdit} disabled={saving}>
                    <X className="mr-1.5 h-4 w-4" /> Cancel
                  </Button>
                )}
              </div>
            </>
          )}

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
