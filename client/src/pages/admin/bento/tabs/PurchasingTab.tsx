import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { purchaseOrdersApi } from '@/lib/api';
import { ShoppingCart, Plus, Package, CheckCircle, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import type { PurchaseOrder, PurchaseOrderItem } from '@shared/schema';

export default function PurchasingTab() {
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const [activePo, setActivePo] = useState<PurchaseOrder | null>(null);

    // Fetch POs
    const { data: pos, isLoading } = useQuery({
        queryKey: ['purchase-orders'],
        queryFn: purchaseOrdersApi.getAll,
    });

    // Mark as Received Mutation
    const receivePoMutation = useMutation({
        mutationFn: (id: string) => purchaseOrdersApi.updateStatus(id, 'Received'),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
            toast({ title: 'Success', description: 'Purchase order marked as received. Inventory updated.' });
        },
        onError: (err: any) => {
            toast({ title: 'Error', description: err.message || 'Failed to update PO.', variant: 'destructive' });
        }
    });

    if (isLoading) {
        return <div className="p-6">Loading Purchase Orders...</div>;
    }

    const activeOrders = pos?.filter((po: PurchaseOrder) => po.status !== 'Received' && po.status !== 'Cancelled') || [];
    const pastOrders = pos?.filter((po: PurchaseOrder) => po.status === 'Received' || po.status === 'Cancelled') || [];

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h2 className="text-2xl font-bold tracking-tight text-gray-900">Purchasing & Receiving</h2>
                    <p className="text-gray-500">Manage vendor purchase orders and inbound inventory.</p>
                </div>
                <Button className="bg-[#52D3D8] hover:bg-[#38bdf8] text-white gap-2">
                    <Plus size={18} /> Create PO
                </Button>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                {/* Active Orders List */}
                <div className="xl:col-span-2 space-y-6">
                    <div className="bg-white rounded-[2rem] p-6 shadow-sm border border-slate-200">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-600 flex items-center justify-center text-white">
                                <Clock size={20} />
                            </div>
                            <h3 className="text-lg font-bold">Active Purchase Orders</h3>
                        </div>
                        <div className="rounded-xl border border-gray-200 overflow-hidden text-sm">
                            <table className="w-full text-left">
                                <thead className="bg-gray-50 border-b border-gray-200 text-gray-500 font-semibold">
                                    <tr>
                                        <th className="px-4 py-3">PO Number</th>
                                        <th className="px-4 py-3">Supplier</th>
                                        <th className="px-4 py-3">Expected</th>
                                        <th className="px-4 py-3 text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100/50">
                                    {activeOrders.length === 0 ? (
                                        <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-500">No active orders</td></tr>
                                    ) : activeOrders.map((po: PurchaseOrder) => (
                                        <tr key={po.id} className="hover:bg-gray-50/50 transition-colors">
                                            <td className="px-4 py-3 font-medium text-gray-900">{po.id}</td>
                                            <td className="px-4 py-3">{po.supplierName}</td>
                                            <td className="px-4 py-3 text-gray-500">
                                                {po.expectedDeliveryDate ? new Date(po.expectedDeliveryDate).toLocaleDateString() : 'TBD'}
                                            </td>
                                            <td className="px-4 py-3 text-right">
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    className="h-8 gap-2 text-emerald-600 border-emerald-200 hover:bg-emerald-50"
                                                    onClick={() => receivePoMutation.mutate(po.id)}
                                                    disabled={receivePoMutation.isPending}
                                                >
                                                    <CheckCircle size={14} /> Mark Received
                                                </Button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

                {/* Quick Stats Column */}
                <div className="space-y-6">
                    <div className="bg-gradient-to-br from-orange-500 to-amber-600 rounded-[2rem] p-6 text-white shadow-lg">
                        <div className="flex justify-between items-start">
                            <div>
                                <h3 className="font-bold text-white/90">Awaiting Delivery</h3>
                                <div className="text-4xl font-bold mt-2">{activeOrders.length}</div>
                            </div>
                            <div className="h-10 w-10 rounded-xl bg-white/20 flex items-center justify-center backdrop-blur-sm">
                                <Package size={20} />
                            </div>
                        </div>
                    </div>

                    <div className="bg-gradient-to-br from-emerald-500 to-teal-600 rounded-[2rem] p-6 text-white shadow-lg">
                        <div className="flex justify-between items-start">
                            <div>
                                <h3 className="font-bold text-white/90">Received This Month</h3>
                                <div className="text-4xl font-bold mt-2">{pastOrders.length}</div>
                            </div>
                            <div className="h-10 w-10 rounded-xl bg-white/20 flex items-center justify-center backdrop-blur-sm">
                                <ShoppingCart size={20} />
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            {/* Past Orders could go here next */}
        </div>
    );
}
