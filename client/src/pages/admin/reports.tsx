import { AdminLayout } from "@/components/layout/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Download, Calendar, FileText, TrendingUp, DollarSign, Wrench, Loader2, Users } from "lucide-react";
import { useState, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { reportsApi, type ReportData } from "@/lib/api";
import { formatDistanceToNow } from "date-fns";

export default function AdminReportsPage() {
  const [selectedPeriod, setSelectedPeriod] = useState("this_month");
  const contentRef = useRef<HTMLDivElement>(null);

  const { data: reportData, isLoading, error } = useQuery({
    queryKey: ["reports", selectedPeriod],
    queryFn: () => reportsApi.getData(selectedPeriod),
  });

  const handleExportPDF = () => {
    if (!reportData) return;
    
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;

    const monthlyRows = reportData.monthlyFinancials.map(d => 
      '<tr><td style="font-size:9px;padding:4px;">' + d.name + '</td><td style="font-size:9px;padding:4px;">৳' + d.income.toLocaleString() + '</td><td style="font-size:9px;padding:4px;">৳' + d.expense.toLocaleString() + '</td><td style="font-size:9px;padding:4px;">' + d.repairs + '</td></tr>'
    ).join('');

    const techRows = reportData.technicianPerformance.map(t =>
      '<tr><td style="font-size:9px;padding:4px;">' + t.name + '</td><td style="font-size:9px;padding:4px;">' + t.tasks + '</td><td style="font-size:9px;padding:4px;">' + t.efficiency + '%</td></tr>'
    ).join('');

    const logRows = reportData.activityLogs.slice(0, 10).map((log) =>
      '<div style="padding:3px 0;border-bottom:1px solid #e5e7eb;font-size:8px;"><span style="font-weight:500;">' + log.action + '</span> <span style="color:#6b7280;">by ' + log.user + '</span></div>'
    ).join('');

    const html = `<!DOCTYPE html><html><head><title>Promise Electronics - Work Reports</title><style>* { margin: 0; padding: 0; box-sizing: border-box; } body { font-family: Arial, sans-serif; padding: 8mm; color: #1f2937; font-size: 10px; line-height: 1.3; } h1 { font-size: 16px; margin-bottom: 2px; color: #0ea5e9; } .date { font-size: 9px; color: #6b7280; margin-bottom: 8px; } .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; margin-bottom: 8px; } .card { border: 1px solid #d1d5db; padding: 8px; border-radius: 4px; background: #f9fafb; } .card-title { font-size: 8px; font-weight: 600; color: #4b5563; margin-bottom: 2px; } .card-value { font-size: 18px; font-weight: bold; color: #0ea5e9; } .card-subtitle { font-size: 7px; color: #9ca3af; margin-top: 1px; } .section { margin-bottom: 8px; page-break-inside: avoid; } .section-title { font-size: 11px; font-weight: 600; margin-bottom: 3px; color: #1f2937; } table { width: 100%; border-collapse: collapse; margin-top: 2px; } th { background-color: #e5e7eb; font-weight: 600; font-size: 8px; padding: 3px 4px; text-align: left; border: 1px solid #d1d5db; } td { border: 1px solid #d1d5db; } @page { size: A4; margin: 5mm; } @media print { body { print-color-adjust: exact; -webkit-print-color-adjust: exact; } }</style></head><body><h1>Promise Electronics</h1><div class="date">Work Reports & Analytics - ${new Date().toLocaleDateString("en-BD")}</div><div class="grid"><div class="card"><div class="card-title">Total Revenue</div><div class="card-value" style="font-size:16px;">৳${reportData.summary.totalRevenue.toLocaleString()}</div></div><div class="card"><div class="card-title">Repair Jobs</div><div class="card-value" style="font-size:16px;">${reportData.summary.totalRepairs}</div></div><div class="card"><div class="card-title">Active Staff</div><div class="card-value" style="font-size:16px;">${reportData.summary.totalStaff}</div></div></div><div class="section"><div class="section-title">Financial Overview</div><table><thead><tr><th>Month</th><th>Income</th><th>Expense</th><th>Repairs</th></tr></thead><tbody>${monthlyRows}</tbody></table></div><div class="section"><div class="section-title">Technician Performance</div><table><thead><tr><th>Technician</th><th>Tasks</th><th>Efficiency</th></tr></thead><tbody>${techRows}</tbody></table></div><div class="section"><div class="section-title">Activity Logs</div>${logRows}</div></body></html>`;

    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.print();
  };

  const formatTimeAgo = (timeStr: string) => {
    try {
      return formatDistanceToNow(new Date(timeStr), { addSuffix: true });
    } catch {
      return "recently";
    }
  };

  if (isLoading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center h-96">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <span className="ml-2">Loading reports...</span>
        </div>
      </AdminLayout>
    );
  }

  if (error) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center h-96">
          <p className="text-destructive">Failed to load reports. Please try again.</p>
        </div>
      </AdminLayout>
    );
  }

  const { monthlyFinancials = [], technicianPerformance = [], activityLogs = [], summary = { totalRevenue: 0, totalRepairs: 0, totalStaff: 0 } } = reportData || {};

  return (
    <AdminLayout>
       <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-heading font-bold">Work Reports & Analytics</h1>
            <p className="text-muted-foreground">System-wide performance metrics and logs.</p>
          </div>
          <div className="flex gap-2">
            <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
                <SelectTrigger className="w-[180px]">
                    <Calendar className="mr-2 h-4 w-4" />
                    <SelectValue placeholder="Select Period" />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="this_week">This Week</SelectItem>
                    <SelectItem value="this_month">This Month</SelectItem>
                    <SelectItem value="last_month">Last Month</SelectItem>
                    <SelectItem value="this_year">This Year</SelectItem>
                </SelectContent>
            </Select>
            <Button variant="outline" className="gap-2" onClick={handleExportPDF} data-testid="button-export-pdf" disabled={!reportData}>
                <Download className="w-4 h-4" /> Export PDF
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
                    <DollarSign className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold" data-testid="text-total-revenue">৳{summary.totalRevenue.toLocaleString()}</div>
                    <p className="text-xs text-muted-foreground">For selected period</p>
                </CardContent>
            </Card>
            <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Repair Jobs</CardTitle>
                    <Wrench className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold" data-testid="text-total-repairs">{summary.totalRepairs}</div>
                    <p className="text-xs text-muted-foreground">Jobs in selected period</p>
                </CardContent>
            </Card>
            <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Active Staff</CardTitle>
                    <Users className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold" data-testid="text-total-staff">{summary.totalStaff}</div>
                    <p className="text-xs text-muted-foreground">Active team members</p>
                </CardContent>
            </Card>
        </div>

        <div ref={contentRef}>
        <Tabs defaultValue="financial" className="w-full">
            <TabsList>
                <TabsTrigger value="financial">Financial Overview</TabsTrigger>
                <TabsTrigger value="technician">Technician Performance</TabsTrigger>
                <TabsTrigger value="logs">Activity Logs</TabsTrigger>
            </TabsList>
            
            <TabsContent value="financial" className="space-y-4 mt-4">
                <Card>
                    <CardHeader>
                        <CardTitle>Income vs Expense</CardTitle>
                        <CardDescription>Monthly financial breakdown for the selected period.</CardDescription>
                    </CardHeader>
                    <CardContent className="h-[400px]">
                        {monthlyFinancials.length > 0 ? (
                          <ResponsiveContainer width="100%" height="100%">
                              <BarChart data={monthlyFinancials}>
                                  <CartesianGrid strokeDasharray="3 3" />
                                  <XAxis dataKey="name" />
                                  <YAxis />
                                  <Tooltip formatter={(value: number) => [`৳${value.toLocaleString()}`, '']} />
                                  <Legend />
                                  <Bar dataKey="income" fill="#0EA5E9" name="Income (৳)" />
                                  <Bar dataKey="expense" fill="#EF4444" name="Expenses (৳)" />
                              </BarChart>
                          </ResponsiveContainer>
                        ) : (
                          <div className="flex items-center justify-center h-full text-muted-foreground">
                            No financial data for selected period
                          </div>
                        )}
                    </CardContent>
                </Card>
                
                <Card>
                    <CardHeader>
                        <CardTitle>Repairs per Month</CardTitle>
                        <CardDescription>Number of repair jobs completed each month.</CardDescription>
                    </CardHeader>
                    <CardContent className="h-[300px]">
                        {monthlyFinancials.length > 0 ? (
                          <ResponsiveContainer width="100%" height="100%">
                              <BarChart data={monthlyFinancials}>
                                  <CartesianGrid strokeDasharray="3 3" />
                                  <XAxis dataKey="name" />
                                  <YAxis />
                                  <Tooltip />
                                  <Bar dataKey="repairs" fill="#22c55e" name="Repairs" />
                              </BarChart>
                          </ResponsiveContainer>
                        ) : (
                          <div className="flex items-center justify-center h-full text-muted-foreground">
                            No repair data for selected period
                          </div>
                        )}
                    </CardContent>
                </Card>
            </TabsContent>

            <TabsContent value="technician" className="space-y-4 mt-4">
                <Card>
                    <CardHeader>
                        <CardTitle>Technician Efficiency</CardTitle>
                        <CardDescription>Tasks completed vs efficiency rating for each technician.</CardDescription>
                    </CardHeader>
                    <CardContent className="h-[400px]">
                        {technicianPerformance.length > 0 ? (
                          <ResponsiveContainer width="100%" height="100%">
                              <BarChart data={technicianPerformance} layout="vertical">
                                  <CartesianGrid strokeDasharray="3 3" />
                                  <XAxis type="number" />
                                  <YAxis dataKey="name" type="category" width={100} />
                                  <Tooltip />
                                  <Legend />
                                  <Bar dataKey="tasks" fill="#0EA5E9" name="Tasks Completed" />
                                  <Bar dataKey="efficiency" fill="#22c55e" name="Efficiency Score (%)" />
                              </BarChart>
                          </ResponsiveContainer>
                        ) : (
                          <div className="flex items-center justify-center h-full text-muted-foreground">
                            No technician data available. Add technicians in User Management.
                          </div>
                        )}
                    </CardContent>
                </Card>
                
                {technicianPerformance.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle>Performance Summary</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {technicianPerformance.map((tech, idx) => (
                          <div key={idx} className="p-4 border rounded-lg">
                            <h4 className="font-semibold">{tech.name}</h4>
                            <p className="text-sm text-muted-foreground">{tech.tasks} tasks completed</p>
                            <div className="mt-2 flex items-center gap-2">
                              <div className="flex-1 h-2 bg-slate-200 rounded-full overflow-hidden">
                                <div 
                                  className="h-full bg-green-500 rounded-full" 
                                  style={{ width: `${tech.efficiency}%` }}
                                />
                              </div>
                              <span className="text-sm font-medium">{tech.efficiency}%</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}
            </TabsContent>

            <TabsContent value="logs" className="mt-4">
                <Card>
                    <CardHeader>
                        <CardTitle>System Activity Logs</CardTitle>
                        <CardDescription>Recent actions performed by staff.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        {activityLogs.length > 0 ? (
                          <div className="space-y-4">
                              {activityLogs.map((log, i) => (
                                  <div key={i} className="flex items-center justify-between border-b pb-2 last:border-0" data-testid={`log-item-${i}`}>
                                      <div className="flex items-center gap-3">
                                          <div className={`h-8 w-8 rounded-full flex items-center justify-center ${
                                            log.type === 'job' ? 'bg-blue-100' : 
                                            log.type === 'payment' ? 'bg-green-100' : 'bg-slate-100'
                                          }`}>
                                              <FileText className={`h-4 w-4 ${
                                                log.type === 'job' ? 'text-blue-500' : 
                                                log.type === 'payment' ? 'text-green-500' : 'text-slate-500'
                                              }`} />
                                          </div>
                                          <div>
                                              <p className="text-sm font-medium">{log.action}</p>
                                              <p className="text-xs text-muted-foreground">by {log.user}</p>
                                          </div>
                                      </div>
                                      <span className="text-xs text-muted-foreground">{formatTimeAgo(log.time)}</span>
                                  </div>
                              ))}
                          </div>
                        ) : (
                          <div className="flex items-center justify-center py-8 text-muted-foreground">
                            No recent activity logs
                          </div>
                        )}
                    </CardContent>
                </Card>
            </TabsContent>
        </Tabs>
        </div>
       </div>
    </AdminLayout>
  );
}
