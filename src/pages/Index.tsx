import { useEffect } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { ShieldCheck, Building2, Users, LogIn, Sun, Moon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useBusiness } from "@/contexts/BusinessContext";
import { useTheme } from "next-themes";

const Index = () => {
  const { resetTheme } = useBusiness();
  const { theme, setTheme } = useTheme();
  useEffect(() => { resetTheme(); }, []);
  return (
    <div className="min-h-[100dvh] flex flex-col bg-background relative overflow-hidden">
      {/* Ambient background orbs */}
      <div className="absolute top-1/4 -left-32 w-72 h-72 rounded-full bg-primary/[0.03] blur-[80px] float" />
      <div className="absolute bottom-1/4 -right-32 w-80 h-80 rounded-full bg-primary/[0.025] blur-[80px] float" style={{ animationDelay: '3s' }} />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-primary/[0.015] blur-[120px]" />

      {/* Top bar — dark mode toggle + Master Login */}
      <div className="flex justify-between items-center px-4 pt-[calc(env(safe-area-inset-top,0px)+0.75rem)] pb-2 relative z-10">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-foreground"
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
        >
          {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </Button>
        <Link to="/auth?master=true">
          <Button variant="ghost" size="sm" className="text-muted-foreground/50 hover:text-foreground gap-1.5 text-xs">
            <LogIn className="h-3.5 w-3.5" />
            Master Login
          </Button>
        </Link>
      </div>

      {/* Main content — vertically centered in remaining space */}
      <div className="flex-1 flex flex-col items-center justify-center px-5 pb-8">
        {/* Logo + branding */}
        <div className="text-center space-y-3 mb-10 relative animate-fade-in">
          <div className="relative inline-block">
            <img
              src="/regal-logo.png"
              alt="Regal Clock"
              className="h-24 w-24 lg:h-20 lg:w-20 mx-auto rounded-2xl object-cover shadow-xl shadow-primary/10 pulse-ring"
            />
          </div>
          <div className="space-y-1">
            <h1 className="text-3xl font-bold text-foreground tracking-tight">Regal Clock</h1>
            <p className="text-muted-foreground text-sm font-medium tracking-wide">Time & Workforce Management</p>
          </div>
        </div>

        {/* Action cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 w-full max-w-2xl animate-fade-in" style={{ animationDelay: '0.15s' }}>
          <Link to="/auth" className="block">
            <Card className="border border-border/50 cursor-pointer hover:border-primary/40 transition-all duration-300 group h-full ambient-glow shimmer card-lift">
              <CardContent className="p-6 sm:p-8 flex flex-row sm:flex-col items-center sm:text-center gap-4 sm:gap-4">
                <div className="h-12 w-12 sm:h-14 sm:w-14 rounded-2xl bg-primary/8 flex items-center justify-center shrink-0 group-hover:bg-primary/15 group-hover:scale-110 transition-all duration-300">
                  <ShieldCheck className="h-6 w-6 sm:h-7 sm:w-7 text-primary" />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-foreground">Business Admin</h2>
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed">Sign in to manage your business</p>
                </div>
              </CardContent>
            </Card>
          </Link>

          <Link to="/portal" className="block">
            <Card className="border border-border/50 cursor-pointer hover:border-primary/40 transition-all duration-300 group h-full ambient-glow shimmer card-lift">
              <CardContent className="p-6 sm:p-8 flex flex-row sm:flex-col items-center sm:text-center gap-4 sm:gap-4">
                <div className="h-12 w-12 sm:h-14 sm:w-14 rounded-2xl bg-primary/8 flex items-center justify-center shrink-0 group-hover:bg-primary/15 group-hover:scale-110 transition-all duration-300">
                  <Users className="h-6 w-6 sm:h-7 sm:w-7 text-primary" />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-foreground">Employee Portal</h2>
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed">Access your roster & timesheets</p>
                </div>
              </CardContent>
            </Card>
          </Link>

          <Link to="/register-business" className="block">
            <Card className="border border-primary/25 cursor-pointer hover:border-primary/50 transition-all duration-300 group h-full bg-primary/[0.02] ambient-glow shimmer card-lift">
              <CardContent className="p-6 sm:p-8 flex flex-row sm:flex-col items-center sm:text-center gap-4 sm:gap-4">
                <div className="h-12 w-12 sm:h-14 sm:w-14 rounded-2xl bg-primary/12 flex items-center justify-center shrink-0 group-hover:bg-primary/20 group-hover:scale-110 transition-all duration-300">
                  <Building2 className="h-6 w-6 sm:h-7 sm:w-7 text-primary" />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-foreground">Register Business</h2>
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed">Set up a new business account</p>
                </div>
              </CardContent>
            </Card>
          </Link>
        </div>
      </div>

      {/* Footer */}
      <p className="py-4 text-center text-[11px] text-muted-foreground/40 tracking-wide pb-[calc(env(safe-area-inset-bottom,0px)+1rem)]">
        © {new Date().getFullYear()} Pro Regal Pavilion Pty Ltd All rights reserved.
      </p>
    </div>
  );
};

export default Index;
