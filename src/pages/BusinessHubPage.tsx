import { useAuth } from "@/contexts/AuthContext";
import { useBusiness } from "@/contexts/BusinessContext";
import { Navigate, Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ShieldCheck, User, Clock, LogOut, Building2 } from "lucide-react";

export default function BusinessHubPage() {
  const { user, isAdmin, isViewer, isApproved, loading, signOut } = useAuth();
  const { business, businesses, loading: bizLoading } = useBusiness();

  if (loading || bizLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Clock className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) return <Navigate to="/auth" replace />;

  if (!isApproved) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="text-center space-y-4">
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
        <div className="text-center space-y-4">
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

  const businessCode = business.business_code;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background p-4">
      <div className="text-center space-y-2 mb-8">
        {business.logo_url ? (
          <img src={business.logo_url} alt={business.name} className="h-20 w-20 mx-auto rounded-full object-cover" />
        ) : (
          <div className="h-20 w-20 mx-auto rounded-full bg-primary/15 flex items-center justify-center">
            <Building2 className="h-10 w-10 text-primary" />
          </div>
        )}
        <h1 className="text-2xl font-bold text-foreground">{business.name}</h1>
        <p className="text-muted-foreground text-sm">Select where you'd like to go</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 w-full max-w-2xl">
        {(isAdmin || isViewer) && (
          <Link to={`/b/${businessCode}/admin`} className="block">
            <Card className="border border-border cursor-pointer hover:border-primary/50 transition-all duration-300 group h-full">
              <CardContent className="p-6 flex flex-col items-center text-center space-y-3">
                <div className="h-14 w-14 rounded-full bg-primary/15 flex items-center justify-center group-hover:bg-primary/25 transition-colors">
                  <ShieldCheck className="h-7 w-7 text-primary" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-foreground">Admin Panel</h2>
                  <p className="text-xs text-muted-foreground mt-1">Manage employees, timesheets & more</p>
                </div>
              </CardContent>
            </Card>
          </Link>
        )}

        <Link to={`/b/${businessCode}/portal`} className="block">
          <Card className="border border-border cursor-pointer hover:border-primary/50 transition-all duration-300 group h-full">
            <CardContent className="p-6 flex flex-col items-center text-center space-y-3">
              <div className="h-14 w-14 rounded-full bg-primary/15 flex items-center justify-center group-hover:bg-primary/25 transition-colors">
                <User className="h-7 w-7 text-primary" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-foreground">Employee Portal</h2>
                <p className="text-xs text-muted-foreground mt-1">View roster, timesheets & requests</p>
              </div>
            </CardContent>
          </Card>
        </Link>

        {(isAdmin && !isViewer) && (
          <Link to={`/b/${businessCode}/kiosk`} className="block">
            <Card className="border border-border cursor-pointer hover:border-primary/50 transition-all duration-300 group h-full">
              <CardContent className="p-6 flex flex-col items-center text-center space-y-3">
                <div className="h-14 w-14 rounded-full bg-primary/15 flex items-center justify-center group-hover:bg-primary/25 transition-colors">
                  <Clock className="h-7 w-7 text-primary" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-foreground">Kiosk</h2>
                  <p className="text-xs text-muted-foreground mt-1">Clock in/out station</p>
                </div>
              </CardContent>
            </Card>
          </Link>
        )}
      </div>

      <Button variant="ghost" className="mt-8 text-muted-foreground" onClick={signOut}>
        <LogOut className="h-4 w-4 mr-2" />
        Sign Out
      </Button>
    </div>
  );
}
