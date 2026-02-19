import { useState, useRef } from "react";
import { useActionLock } from "@/contexts/ActionLockContext";
import { useBusiness, BusinessTheme } from "@/contexts/BusinessContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Building2, Upload, Palette, Check, Loader2, BookOpen } from "lucide-react";
import { logMasterAudit } from "@/lib/auditLog";
import EventSetupSettings from "@/components/EventSetupSettings";

export default function MyBusinessPage() {
  const { runAction } = useActionLock();
  const { business, refreshBusiness, applyTheme } = useBusiness();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState(business?.name || "");
  const [email, setEmail] = useState(business?.email || "");
  const [phone, setPhone] = useState(business?.phone || "");
  const [address, setAddress] = useState(business?.address || "");
  const [industry, setIndustry] = useState(business?.industry || "");
  const [description, setDescription] = useState(business?.description || "");
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [analyzingTheme, setAnalyzingTheme] = useState(false);
  const [suggestedThemes, setSuggestedThemes] = useState<{ name: string; theme: BusinessTheme }[]>([]);
  const [selectedThemeIdx, setSelectedThemeIdx] = useState<number | null>(null);

  if (!business) return <div className="p-6 text-muted-foreground">No business selected.</div>;

  const handleSave = async () => {
    await runAction(async () => {
      setSaving(true);
      const { error } = await supabase
        .from("businesses")
        .update({
          name: name.trim(),
          email: email.trim() || null,
          phone: phone.trim() || null,
          address: address.trim() || null,
          industry: industry.trim() || null,
          description: description.trim() || null,
        })
        .eq("id", business.id);

      if (error) {
        toast({ title: "Error", description: error.message, variant: "destructive" });
      } else {
        toast({ title: "Saved", description: "Business details updated." });
        logMasterAudit("business_details_updated", {
          business_id: business.id,
          business_name: name.trim(),
          fields_updated: ["name", "email", "phone", "address", "industry", "description"],
        });
        await refreshBusiness();
      }
      setSaving(false);
    });
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast({ title: "Error", description: "Please upload an image file", variant: "destructive" });
      return;
    }

    setUploadingLogo(true);
    const ext = file.name.split(".").pop();
    const path = `${business.id}/logo.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from("business-logos")
      .upload(path, file, { upsert: true });

    if (uploadError) {
      toast({ title: "Upload Error", description: uploadError.message, variant: "destructive" });
      setUploadingLogo(false);
      return;
    }

    const { data: urlData } = supabase.storage.from("business-logos").getPublicUrl(path);

    await supabase
      .from("businesses")
      .update({ logo_url: urlData.publicUrl })
      .eq("id", business.id);

    await refreshBusiness();
    toast({ title: "Logo Updated", description: "Your business logo has been uploaded." });
    logMasterAudit("business_logo_updated", { business_id: business.id, business_name: business.name });
    setUploadingLogo(false);
  };

  const handleAnalyzeTheme = async () => {
    if (!business.logo_url) {
      toast({ title: "No Logo", description: "Upload a logo first to analyze for themes", variant: "destructive" });
      return;
    }

    setAnalyzingTheme(true);
    setSuggestedThemes([]);
    setSelectedThemeIdx(null);

    try {
      const { data, error } = await supabase.functions.invoke("analyze-theme", {
        body: { imageUrl: business.logo_url },
      });

      if (error) throw error;

      if (data?.themes && Array.isArray(data.themes)) {
        setSuggestedThemes(data.themes);
        toast({ title: "Themes Generated", description: "Select a theme below to apply it." });
      } else {
        toast({ title: "Error", description: "Could not generate themes", variant: "destructive" });
      }
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Failed to analyze theme", variant: "destructive" });
    }
    setAnalyzingTheme(false);
  };

  const handleApplyTheme = async (idx: number) => {
    const chosen = suggestedThemes[idx];
    if (!chosen) return;

    setSelectedThemeIdx(idx);
    applyTheme(chosen.theme);

    const { error } = await supabase
      .from("businesses")
      .update({ theme: chosen.theme as any })
      .eq("id", business.id);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Theme Applied", description: `"${chosen.name}" theme is now active.` });
      logMasterAudit("business_theme_changed", { business_id: business.id, business_name: business.name, theme_name: chosen.name });
      await refreshBusiness();
    }
  };

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Logo & Branding */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" /> Business Profile
          </CardTitle>
          <CardDescription>Manage your business logo and branding</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="h-20 w-20 rounded-lg border border-border bg-muted flex items-center justify-center overflow-hidden">
              {business.logo_url ? (
                <img src={business.logo_url} alt="Logo" className="h-full w-full object-cover" />
              ) : (
                <Building2 className="h-8 w-8 text-muted-foreground" />
              )}
            </div>
            <div className="space-y-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleLogoUpload}
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingLogo}
              >
                {uploadingLogo ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Upload className="h-4 w-4 mr-2" />}
                {uploadingLogo ? "Uploading..." : "Upload Logo"}
              </Button>
              <p className="text-xs text-muted-foreground">JPG, PNG or SVG. Max 5MB.</p>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Business Code</Label>
            <Input value={business.business_code} disabled />
            <p className="text-xs text-muted-foreground">Used by employees to access kiosk & portal.</p>
          </div>
        </CardContent>
      </Card>

      {/* Details */}
      <Card>
        <CardHeader>
          <CardTitle>Business Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Business Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Email</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="business@example.com" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Phone</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+61 ..." />
            </div>
            <div className="space-y-2">
              <Label>Industry</Label>
              <Input value={industry} onChange={(e) => setIndustry(e.target.value)} placeholder="e.g. Hospitality" />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Address</Label>
            <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="123 Main St..." />
          </div>
          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Brief description of your business" rows={3} />
          </div>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save Details"}
          </Button>
        </CardContent>
      </Card>

      {/* Theme */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Palette className="h-5 w-5" /> Theme
          </CardTitle>
          <CardDescription>
            {business.logo_url
              ? "Analyze your logo to get theme suggestions"
              : "Upload a logo first to generate theme suggestions"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button
            onClick={handleAnalyzeTheme}
            disabled={analyzingTheme || !business.logo_url}
            variant="outline"
          >
            {analyzingTheme ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Palette className="h-4 w-4 mr-2" />}
            {analyzingTheme ? "Analyzing..." : "Generate Themes from Logo"}
          </Button>

          {suggestedThemes.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {suggestedThemes.map((t, idx) => (
                <button
                  key={idx}
                  onClick={() => handleApplyTheme(idx)}
                  className={`relative p-4 rounded-lg border transition-all text-left ${
                    selectedThemeIdx === idx
                      ? "border-primary ring-2 ring-primary/30"
                      : "border-border hover:border-primary/50"
                  }`}
                >
                  {selectedThemeIdx === idx && (
                    <div className="absolute top-2 right-2">
                      <Check className="h-4 w-4 text-primary" />
                    </div>
                  )}
                  <p className="text-sm font-medium mb-2">{t.name}</p>
                  <div className="flex gap-1">
                    {[t.theme.primary, t.theme.background, t.theme.accent, t.theme.card].map((c, i) => (
                      <div
                        key={i}
                        className="h-6 w-6 rounded-full border border-border"
                        style={{ backgroundColor: `hsl(${c})` }}
                      />
                    ))}
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* Current theme preview */}
          <div className="pt-2">
            <p className="text-xs text-muted-foreground mb-2">Current Theme</p>
            <div className="flex gap-2">
              {business.theme && Object.entries(business.theme).map(([key, val]) => (
                <div key={key} className="text-center">
                  <div
                    className="h-8 w-8 rounded-full border border-border mx-auto"
                    style={{ backgroundColor: `hsl(${val})` }}
                  />
                  <span className="text-[10px] text-muted-foreground">{key}</span>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
      {/* Event Setup */}
      <EventSetupSettings />

      {/* Instruction Manual */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BookOpen className="h-5 w-5" /> Instruction Manual
          </CardTitle>
          <CardDescription>
            Complete guide covering kiosk operations, admin workflows, and employee self-service features
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            variant="outline"
            onClick={() => window.open("/induction-guide.html", "_blank")}
            className="gap-2"
          >
            <BookOpen className="h-4 w-4" />
            Open Instruction Manual
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
