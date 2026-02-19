import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FileText, ShieldAlert } from "lucide-react";

export default function MasterAuditLogPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Platform Audit Log</h1>
        <p className="text-muted-foreground">Master-level platform activity</p>
      </div>

      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-primary" />
            Privacy Notice
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Business-level audit logs are only accessible by the respective business admins to protect tenant privacy. 
            The master admin panel does not have access to individual business activity logs, employee data, or clock events.
          </p>
          <p className="text-sm text-muted-foreground">
            Master-level actions (such as business deletions and user management) are logged and visible here in future updates.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
