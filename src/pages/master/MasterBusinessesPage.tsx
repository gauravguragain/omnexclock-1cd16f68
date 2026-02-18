import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Building2, Mail, Phone, MapPin, Calendar, Users } from "lucide-react";
import { format } from "date-fns";

interface BusinessInfo {
  id: string;
  name: string;
  business_code: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  industry: string | null;
  description: string | null;
  logo_url: string | null;
  created_at: string | null;
  owner_email?: string;
}

export default function MasterBusinessesPage() {
  const [businesses, setBusinesses] = useState<BusinessInfo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from("businesses")
        .select("id, name, business_code, email, phone, address, industry, description, logo_url, created_at, owner_id")
        .order("created_at", { ascending: false });

      if (data) {
        // Get owner emails from profiles
        const ownerIds = [...new Set(data.map(b => b.owner_id))];
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, email")
          .in("id", ownerIds);

        const profileMap = new Map(profiles?.map(p => [p.id, p.email]) || []);

        setBusinesses(data.map(b => ({
          ...b,
          owner_email: profileMap.get(b.owner_id) || "Unknown",
        })));
      }
      setLoading(false);
    };
    load();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Building2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Registered Businesses</h1>
        <p className="text-muted-foreground">View all businesses on the platform. No access to their internal data.</p>
      </div>

      {businesses.length === 0 ? (
        <Card className="bg-card border-border">
          <CardContent className="py-12 text-center text-muted-foreground">
            No businesses registered yet.
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {businesses.map((biz) => (
            <Card key={biz.id} className="bg-card border-border">
              <CardHeader className="pb-3">
                <div className="flex items-start gap-3">
                  {biz.logo_url ? (
                    <img src={biz.logo_url} alt={biz.name} className="h-12 w-12 rounded-lg object-cover flex-shrink-0" />
                  ) : (
                    <div className="h-12 w-12 rounded-lg bg-primary/15 flex items-center justify-center flex-shrink-0">
                      <Building2 className="h-6 w-6 text-primary" />
                    </div>
                  )}
                  <div className="min-w-0">
                    <CardTitle className="text-base text-foreground">{biz.name}</CardTitle>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant="outline" className="text-xs text-primary border-primary/30">{biz.business_code}</Badge>
                      {biz.industry && (
                        <Badge variant="secondary" className="text-xs">{biz.industry}</Badge>
                      )}
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {biz.description && (
                  <p className="text-muted-foreground">{biz.description}</p>
                )}
                <div className="grid grid-cols-1 gap-1.5 text-muted-foreground">
                  {biz.email && (
                    <div className="flex items-center gap-2">
                      <Mail className="h-3.5 w-3.5 flex-shrink-0" />
                      <span className="truncate">{biz.email}</span>
                    </div>
                  )}
                  {biz.phone && (
                    <div className="flex items-center gap-2">
                      <Phone className="h-3.5 w-3.5 flex-shrink-0" />
                      <span>{biz.phone}</span>
                    </div>
                  )}
                  {biz.address && (
                    <div className="flex items-center gap-2">
                      <MapPin className="h-3.5 w-3.5 flex-shrink-0" />
                      <span className="truncate">{biz.address}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <Users className="h-3.5 w-3.5 flex-shrink-0" />
                    <span>Owner: {biz.owner_email}</span>
                  </div>
                  {biz.created_at && (
                    <div className="flex items-center gap-2">
                      <Calendar className="h-3.5 w-3.5 flex-shrink-0" />
                      <span>Registered {format(new Date(biz.created_at), "MMM d, yyyy")}</span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
