import { useAuth } from "@/contexts/AuthContext";
import { useBusiness } from "@/contexts/BusinessContext";
import { Navigate, Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ShieldCheck, LogOut, Building2, PartyPopper, Utensils } from "lucide-react";
import { useEffect } from "react";

export default function BusinessHubPage() {
  const { user, isApproved, isMaster, isAdminOf, isViewerOf, hasAccessTo, loading, signOut } = useAuth();
  const { business, businesses, loading: bizLoading, setBusiness, applyTheme, resetTheme } = useBusiness();

  // Always reset to default theme on the hub
  useEffect(() => { resetTheme(); }, []);

  if (loading || bizLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background p-4">
        <div className="space-y-5 w-full max-w-sm">
          <div className="flex flex-col items-center gap-3">
            <div className="h-16 w-16 rounded-2xl skeleton-shimmer" />
            <div className="h-4 w-32 rounded skeleton-shimmer" />
            <div className="h-3 w-24 rounded skeleton-shimmer" />
          </div>
          <div className="space-y-3">
            <div className="h-28 rounded-xl skeleton-shimmer" />
          </div>
        </div>
      </div>
    );
  }

  if (!user) return <Navigate to="/auth" replace />;
  if (isMaster) return <Navigate to="/master" replace />;
  const wantsEvents = new URLSearchParams(window.location.search).get("next") === "events";
  if (wantsEvents && isApproved && business && businesses.length === 1) return <Navigate to={`/b/${business.business_code}/events`} replace />;

  if (!isApproved) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="text-center space-y-4 animate-fade-in">
          <h1 className="text-xl font-bold text-foreground">Account Pending Approval</h1>
          <p className="text-muted-foreground">Your account is awaiting approval from an administrator.</p>
          <Button variant="outline" onClick={signOut}>Sign Out</Button>
        </div>
      </div>
    );
  }

  if (!business || businesses.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="text-center space-y-4 animate-fade-in">
          <h1 className="text-xl font-bold text-foreground">No Business Found</h1>
          <p className="text-muted-foreground">You don't have a business linked to your account yet.</p>
          <div className="flex gap-3 justify-center">
            <Link to="/register-business">
              <Button>Register a Business</Button>
            </Link>
            <Button variant="outline" onClick={signOut}>Sign Out</Button>
          </div>
        </div>
      </div>
    );
  }

  // If user has multiple businesses, show a selection
  if (businesses.length > 1) {
    return (
      <div className="min-h-[100dvh] flex flex-col items-center justify-center bg-background p-4 relative overflow-hidden standalone-top-pad safe-x">
        <div className="absolute top-1/4 -left-32 w-72 h-72 rounded-full bg-primary/[0.025] blur-[80px]" />
        <div className="absolute bottom-1/4 -right-32 w-80 h-80 rounded-full bg-primary/[0.02] blur-[80px]" />

        <div className="text-center space-y-3 mb-10 animate-fade-in">
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Your Businesses</h1>
          <p className="text-muted-foreground text-sm">Select a business to manage</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 w-full max-w-xl mb-10 animate-fade-in" style={{ animationDelay: '0.1s' }}>
          {businesses.map((biz) => {
            const isAdmin = isAdminOf(biz.id);
            const isViewerOnly = isViewerOf(biz.id) && !isAdmin;
            return (
              <Link
                key={biz.id}
                to={`/b/${biz.business_code}/${wantsEvents ? "events" : "admin"}`}
                onClick={() => { setBusiness(biz); applyTheme(biz.theme); }}
                className="block"
              >
                <Card className="border border-border/50 cursor-pointer hover:border-primary/40 transition-all duration-300 group h-full card-lift">
                  <CardContent className="p-8 flex flex-col items-center text-center space-y-4">
                    {biz.logo_url ? (
                      <img src={biz.logo_url} alt={biz.name} className="h-14 w-14 rounded-2xl object-cover ring-1 ring-border/40" />
                    ) : (
                      <div className="h-14 w-14 rounded-2xl bg-primary/8 flex items-center justify-center group-hover:bg-primary/15 transition-colors duration-300">
                        <Building2 className="h-7 w-7 text-primary" />
                      </div>
                    )}
                    <div>
                      <h2 className="text-base font-semibold text-foreground">{biz.name}</h2>
                      <p className="text-xs text-muted-foreground mt-1.5 font-medium">
                        {isAdmin ? "Admin" : isViewerOnly ? "Viewer" : "Member"}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>

        <Button variant="ghost" className="text-muted-foreground hover:text-foreground transition-colors" onClick={signOut}>
          <LogOut className="h-4 w-4 mr-2" />
          Sign Out
        </Button>
      </div>
    );
  }

  // Single business - go straight to admin
  const businessCode = business.business_code;

  return (
    <div className="min-h-[100dvh] flex flex-col items-center justify-center bg-background p-4 relative overflow-hidden standalone-top-pad safe-x">
      <div className="absolute top-1/4 -left-32 w-72 h-72 rounded-full bg-primary/[0.025] blur-[80px]" />
      <div className="absolute bottom-1/4 -right-32 w-80 h-80 rounded-full bg-primary/[0.02] blur-[80px]" />

      <div className="text-center space-y-4 mb-10 animate-fade-in">
        {business.logo_url ? (
          <img src={business.logo_url} alt={business.name} className="h-20 w-20 mx-auto rounded-2xl object-cover shadow-xl shadow-primary/10 ring-1 ring-border/30" />
        ) : (
          <div className="h-20 w-20 mx-auto rounded-2xl bg-primary/8 flex items-center justify-center">
            <Building2 className="h-10 w-10 text-primary" />
          </div>
        )}
        <div className="space-y-1">
          <h1 className="text-2xl font-bold text-foreground tracking-tight">{business.name}</h1>
          <p className="text-muted-foreground text-sm">Business Administration</p>
        </div>
      </div>

      <div className="w-full max-w-sm animate-fade-in" style={{ animationDelay: '0.1s' }}>
        <Link
          to={`/b/${businessCode}/admin`}
          onClick={() => applyTheme(business.theme)}
          className="block"
        >
          <Card className="border border-border/50 cursor-pointer hover:border-primary/40 transition-all duration-300 group card-lift">
            <CardContent className="p-8 flex flex-col items-center text-center space-y-4">
              <div className="h-14 w-14 rounded-2xl bg-primary/8 flex items-center justify-center group-hover:bg-primary/15 group-hover:scale-110 transition-all duration-300">
                <ShieldCheck className="h-7 w-7 text-primary" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-foreground">Admin Panel</h2>
                <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">Manage employees, timesheets & more</p>
              </div>
            </CardContent>
          </Card>
        </Link>
        <Link to={`/b/${businessCode}/events`} onClick={() => applyTheme(business.theme)} className="mt-4 block">
          <Card className="border border-border/50 cursor-pointer hover:border-primary/40 transition-all duration-300 group card-lift">
            <CardContent className="p-8 flex flex-col items-center text-center space-y-4">
              <div className="h-14 w-14 rounded-2xl bg-primary/8 flex items-center justify-center group-hover:bg-primary/15 group-hover:scale-110 transition-all duration-300">
                <PartyPopper className="h-7 w-7 text-primary" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-foreground">Events & Sales</h2>
                <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">Leads, events, menus & venue</p>
              </div>
            </CardContent>
          </Card>
        </Link>
      </div>

      <Button variant="ghost" className="mt-10 text-muted-foreground hover:text-foreground transition-colors" onClick={signOut}>
        <LogOut className="h-4 w-4 mr-2" />
        Sign Out
      </Button>
    </div>
  );
}