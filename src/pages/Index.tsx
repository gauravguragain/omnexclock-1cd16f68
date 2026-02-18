import { useEffect } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { ShieldCheck, Building2, Clock } from "lucide-react";
import { useBusiness } from "@/contexts/BusinessContext";

const Index = () => {
  const { resetTheme } = useBusiness();
  useEffect(() => { resetTheme(); }, []);
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background p-4">
      <div className="text-center space-y-2 mb-8">
        <div className="h-20 w-20 mx-auto rounded-full bg-primary/15 flex items-center justify-center">
          <Clock className="h-10 w-10 text-primary" />
        </div>
        <h1 className="text-2xl font-bold text-foreground">OmnexClock</h1>
        <p className="text-muted-foreground text-sm">Time & Workforce Management</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full max-w-lg">
        <Link to="/auth" className="block">
          <Card className="border border-border cursor-pointer hover:border-primary/50 transition-all duration-300 group h-full">
            <CardContent className="p-6 flex flex-col items-center text-center space-y-3">
              <div className="h-14 w-14 rounded-full bg-primary/15 flex items-center justify-center group-hover:bg-primary/25 transition-colors">
                <ShieldCheck className="h-7 w-7 text-primary" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-foreground">Business Admin</h2>
                <p className="text-xs text-muted-foreground mt-1">Sign in to manage your business</p>
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link to="/register-business" className="block">
          <Card className="border border-primary/30 cursor-pointer hover:border-primary/60 transition-all duration-300 group h-full bg-primary/5">
            <CardContent className="p-6 flex flex-col items-center text-center space-y-3">
              <div className="h-14 w-14 rounded-full bg-primary/20 flex items-center justify-center group-hover:bg-primary/30 transition-colors">
                <Building2 className="h-7 w-7 text-primary" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-foreground">Register Business</h2>
                <p className="text-xs text-muted-foreground mt-1">Set up a new business account</p>
              </div>
            </CardContent>
          </Card>
        </Link>
      </div>

      <p className="mt-10 text-center text-xs text-muted-foreground">
        © 2024 Omnex Ventures Pty. Ltd. All rights reserved.
      </p>
    </div>
  );
};

export default Index;
