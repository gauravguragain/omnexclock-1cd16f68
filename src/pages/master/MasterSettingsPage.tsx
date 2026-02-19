import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Settings, Server, Database, Shield, Globe } from "lucide-react";

export default function MasterSettingsPage() {
  const [platformInfo] = useState({
    version: "1.0.0",
    environment: window.location.hostname.includes("localhost") ? "Development" : "Production",
    timezone: "Australia/Sydney",
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">System Settings</h1>
        <p className="text-muted-foreground">Platform configuration and information</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <Server className="h-4 w-4 text-primary" />
              Platform Info
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Version</span>
              <Badge variant="outline">{platformInfo.version}</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Environment</span>
              <Badge className={platformInfo.environment === "Production" ? "bg-green-500/20 text-green-500" : "bg-amber-500/20 text-amber-500"}>
                {platformInfo.environment}
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Default Timezone</span>
              <span className="text-sm text-foreground">{platformInfo.timezone}</span>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <Database className="h-4 w-4 text-primary" />
              Backend Status
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Database</span>
              <Badge className="bg-green-500/20 text-green-500">Connected</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Authentication</span>
              <Badge className="bg-green-500/20 text-green-500">Active</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Storage</span>
              <Badge className="bg-green-500/20 text-green-500">Active</Badge>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <Shield className="h-4 w-4 text-primary" />
              Security
            </CardTitle>
            <CardDescription>Security configuration overview</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Row Level Security</span>
              <Badge className="bg-green-500/20 text-green-500">Enabled</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Email Verification</span>
              <Badge className="bg-green-500/20 text-green-500">Required</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Kiosk Rate Limiting</span>
              <Badge className="bg-green-500/20 text-green-500">Active</Badge>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <Globe className="h-4 w-4 text-primary" />
              Integrations
            </CardTitle>
            <CardDescription>External service connections</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Email (Resend)</span>
              <Badge className="bg-green-500/20 text-green-500">Configured</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Photo Capture</span>
              <Badge className="bg-green-500/20 text-green-500">Enabled</Badge>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
