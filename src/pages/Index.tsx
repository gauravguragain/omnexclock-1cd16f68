import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Clock, Shield } from "lucide-react";

const Index = () => {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background p-4">
      <div className="text-center space-y-6 max-w-md">
        <img src="/logo.jpeg" alt="Pro Regal Pavilion" className="h-24 w-24 mx-auto rounded-xl object-cover gold-glow" />
        <div>
          <h1 className="text-3xl font-bold gold-text mb-2">Pro Regal Pavilion</h1>
          <p className="text-muted-foreground">Staff Time Clock System</p>
        </div>

        <div className="grid gap-3">
          <Button asChild size="lg" className="w-full h-14 text-lg">
            <Link to="/kiosk">
              <Clock className="mr-2 h-5 w-5" /> Staff Clock In / Out
            </Link>
          </Button>
          <Button asChild variant="outline" size="lg" className="w-full h-14 text-lg gold-border">
            <Link to="/admin">
              <Shield className="mr-2 h-5 w-5" /> Admin Dashboard
            </Link>
          </Button>
        </div>

        <p className="text-xs text-muted-foreground pt-4">
          © 2024 Omnex Ventures Pty. Ltd. All rights reserved.
        </p>
      </div>
    </div>
  );
};

export default Index;
