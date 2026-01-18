import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Bell, AlertTriangle, TrendingUp, Eye } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';

interface Insight {
    id: number;
    type: 'red' | 'green' | 'blue';
    title: string;
    content: string;
    actionableStep: string;
    isRead: boolean;
    createdAt: string;
}

export function MorningBrief() {
    const { data: insights, isLoading } = useQuery<{ insights: Insight[] }>({
        queryKey: ['/api/ai/insights'],
    });

    if (isLoading) return <div className="p-4">Loading insights...</div>;

    if (!insights?.insights?.length) {
        return (
            <Card className="bg-gray-50 border-dashed">
                <CardContent className="flex flex-col items-center justify-center p-6 text-gray-500">
                    <Bell className="w-8 h-8 mb-2 opacity-50" />
                    <p>No new insights yet. Check back tomorrow!</p>
                </CardContent>
            </Card>
        );
    }

    const getIcon = (type: string) => {
        switch (type) {
            case 'red': return <AlertTriangle className="w-5 h-5 text-red-500" />;
            case 'green': return <TrendingUp className="w-5 h-5 text-green-500" />;
            case 'blue': return <Eye className="w-5 h-5 text-blue-500" />;
            default: return <Bell className="w-5 h-5" />;
        }
    };

    const getCardClass = (type: string) => {
        switch (type) {
            case 'red': return 'border-l-4 border-l-red-500 bg-red-50/50';
            case 'green': return 'border-l-4 border-l-green-500 bg-green-50/50';
            case 'blue': return 'border-l-4 border-l-blue-500 bg-blue-50/50';
            default: return 'border-l-4 border-gray-300';
        }
    };

    return (
        <div className="space-y-4">
            <h2 className="text-xl font-bold flex items-center gap-2">
                <Bell className="w-6 h-6" />
                Morning Brief
            </h2>

            <div className="grid gap-4 md:grid-cols-3">
                {insights.insights.map((insight: Insight) => (
                    <Card key={insight.id} className={`${getCardClass(insight.type)} shadow-sm`}>
                        <CardHeader className="flex flex-row items-start gap-3 pb-2 space-y-0">
                            <div className="mt-1">{getIcon(insight.type)}</div>
                            <div className="flex-1">
                                <CardTitle className="text-base font-semibold text-gray-900">
                                    {insight.title}
                                </CardTitle>
                            </div>
                        </CardHeader>
                        <CardContent>
                            <p className="text-sm text-gray-700 mb-3">{insight.content}</p>
                            {insight.actionableStep && (
                                <div className="text-xs bg-white/60 rounded p-2 border border-black/5">
                                    <strong>Action:</strong> {insight.actionableStep}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                ))}
            </div>
        </div>
    );
}
