import React from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function Security() {
  return (
    <div className="mx-auto max-w-lg p-6">
      <Card>
        <CardHeader>
          <CardTitle>Bezpieczeństwo</CardTitle>
          <CardDescription>
            System logowania i uwierzytelniania użytkowników jest wyłączony w tej instalacji aplikacji.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Nie ma kont, haseł ani MFA — CRM działa w trybie otwartym (dostęp zależy wyłącznie od hostingu i sieci).
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
