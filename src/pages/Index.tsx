import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { ShieldCheck, User } from "lucide-react";

const Index = () => {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background p-4">
      <div className="text-center space-y-2 mb-8">
        <img src="/logo.jpeg" alt="Pro Regal Pavilion" className="h-20 w-20 mx-auto rounded-lg object-cover gold-glow" />
        <h1 className="text-2xl font-bold gold-text">Pro Regal Pavilion</h1>
        <p className="text-muted-foreground text-sm">Select your portal</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full max-w-lg">
        <Link to="/auth" className="block">
          <Card className="gold-border border cursor-pointer hover:gold-glow transition-all duration-300 group h-full">
            <CardContent className="p-6 flex flex-col items-center text-center space-y-3">
              <div className="h-14 w-14 rounded-full bg-primary/15 flex items-center justify-center group-hover:bg-primary/25 transition-colors">
                <ShieldCheck className="h-7 w-7 text-primary" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-foreground">Admin</h2>
                <p className="text-xs text-muted-foreground mt-1">Dashboard, timesheets, payroll & roster management</p>
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link to="/portal" className="block">
          <Card className="gold-border border cursor-pointer hover:gold-glow transition-all duration-300 group h-full">
            <CardContent className="p-6 flex flex-col items-center text-center space-y-3">
              <div className="h-14 w-14 rounded-full bg-primary/15 flex items-center justify-center group-hover:bg-primary/25 transition-colors">
                <User className="h-7 w-7 text-primary" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-foreground">Employee Portal</h2>
                <p className="text-xs text-muted-foreground mt-1">View your roster, timesheets & clock history</p>
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
