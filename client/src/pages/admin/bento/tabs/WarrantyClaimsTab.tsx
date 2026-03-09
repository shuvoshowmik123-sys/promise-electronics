import React from 'react';
import { WarrantyClaimsTable } from '@/components/admin/corporate/WarrantyClaimsTable';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ShieldCheck } from 'lucide-react';

export default function WarrantyClaimsTab() {
    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight">Warranty Claims</h2>
                    <p className="text-muted-foreground">
                        Review and manage client warranty claims and approve warranty jobs.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <ShieldCheck className="h-8 w-8 text-primary opacity-20" />
                </div>
            </div>

            <Card className="border-border/40 shadow-sm bg-card/50 backdrop-blur-sm">
                <CardHeader>
                    <CardTitle>Active Claims</CardTitle>
                    <CardDescription>
                        All pending and processed warranty claims across the system.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <WarrantyClaimsTable />
                </CardContent>
            </Card>
        </div>
    );
}
