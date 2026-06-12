import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { purchaseOrdersApi, inventoryApi } from '@/lib/api';
import { ShoppingCart, Plus, Package, CheckCircle, Clock, X, Trash2, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import type { PurchaseOrder, PurchaseOrderItem, InsertPurchaseOrder, InsertPurchaseOrderItem } from '@shared/schema';
import { DashboardSkeleton } from '../shared';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface FormItem {
    inventoryItemId: string;
    quantity: number;
    unitPrice: number;
}

export default function PurchasingTab() {
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
    const [isDetailDialogOpen, setIsDetailDialogOpen] = useState(false);
    const [selectedPo, setSelectedPo] = useState<PurchaseOrder | null>(null);

    const [supplierName, setSupplierName] = useState('');
    const [expectedDeliveryDate, setExpectedDeliveryDate] = useState('');
    const [notes, setNotes] = useState('');
    const [items, setItems] = useState<FormItem[]>([]);

    const { data: pos, isLoading } = useQuery({
        queryKey: ['purchase-orders'],
        queryFn: purchaseOrdersApi.getAll,
    });

    const { data: inventoryItems } = useQuery({
        queryKey: ['inventory'],
        queryFn: inventoryApi.getAll,
        enabled: isCreateDialogOpen,
    });

    const { data: poItems } = useQuery({
        queryKey: ['purchase-order-items', selectedPo?.id],
        queryFn: () => purchaseOrdersApi.getItems(selectedPo!.id),
        enabled: !!selectedPo && isDetailDialogOpen,
    });

    const createPoMutation = useMutation({
        mutationFn: (data: { order: InsertPurchaseOrder; items: InsertPurchaseOrderItem[] }) =>
            purchaseOrdersApi.create(data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
            toast({ title: 'Success', description: 'Purchase order created successfully.' });
            resetForm();
            setIsCreateDialogOpen(false);
        },
        onError: (err: any) => {
            toast({ title: 'Error', description: err.message || 'Failed to create purchase order.', variant: 'destructive' });
        }
    });

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

    const resetForm = () => {
        setSupplierName('');
        setExpectedDeliveryDate('');
        setNotes('');
        setItems([]);
    };

    const addItem = () => {
        setItems([...items, { inventoryItemId: '', quantity: 1, unitPrice: 0 }]);
    };

    const removeItem = (index: number) => {
        setItems(items.filter((_, i) => i !== index));
    };

    const updateItem = (index: number, field: keyof FormItem, value: string | number) => {
        setItems(items.map((item, i) => i === index ? { ...item, [field]: value } : item));
    };

    const totalAmount = items.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0);

    const handleSubmit = () => {
        if (!supplierName.trim()) {
            toast({ title: 'Error', description: 'Supplier name is required.', variant: 'destructive' });
            return;
        }
        if (items.length === 0) {
            toast({ title: 'Error', description: 'At least one item is required.', variant: 'destructive' });
            return;
        }
        const invalidItems = items.filter(item => !item.inventoryItemId || item.quantity <= 0);
        if (invalidItems.length > 0) {
            toast({ title: 'Error', description: 'All items must have an inventory item selected and quantity > 0.', variant: 'destructive' });
            return;
        }

        const poId = crypto.randomUUID();
        const order: InsertPurchaseOrder = {
            id: poId,
            supplierName: supplierName.trim(),
            status: 'Pending',
            totalAmount,
            expectedDeliveryDate: expectedDeliveryDate ? new Date(expectedDeliveryDate) : null,
            notes: notes.trim() || null,
            storeId: null,
        };

        const orderItems: InsertPurchaseOrderItem[] = items.map(item => ({
            id: crypto.randomUUID(),
            purchaseOrderId: poId,
            inventoryItemId: item.inventoryItemId,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
        }));

        createPoMutation.mutate({ order, items: orderItems });
    };

    if (isLoading) {
        return <DashboardSkeleton />;
    }

    const activeOrders = pos?.filter((po: PurchaseOrder) => po.status !== 'Received' && po.status !== 'Cancelled') || [];
    const pastOrders = pos?.filter((po: PurchaseOrder) => po.status === 'Received' || po.status === 'Cancelled') || [];

    return (
        <div className="space-y-6 pb-24 md:pb-0">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h2 className="text-2xl font-bold tracking-tight text-gray-900">Purchasing & Receiving</h2>
                    <p className="text-gray-500">Manage vendor purchase orders and inbound inventory.</p>
                </div>
                <Button className="bg-[#52D3D8] hover:bg-[#38bdf8] text-white gap-2" onClick={() => setIsCreateDialogOpen(true)}>
                    <Plus size={18} /> Create PO
                </Button>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
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
                                                <div className="flex gap-2 justify-end">
                                                    <Button
                                                        size="sm"
                                                        variant="outline"
                                                        className="h-8 gap-2 text-blue-600 border-blue-200 hover:bg-blue-50"
                                                        onClick={() => {
                                                            setSelectedPo(po);
                                                            setIsDetailDialogOpen(true);
                                                        }}
                                                    >
                                                        <Eye size={14} /> View
                                                    </Button>
                                                    <Button
                                                        size="sm"
                                                        variant="outline"
                                                        className="h-8 gap-2 text-emerald-600 border-emerald-200 hover:bg-emerald-50"
                                                        onClick={() => receivePoMutation.mutate(po.id)}
                                                        disabled={receivePoMutation.isPending}
                                                    >
                                                        <CheckCircle size={14} /> Mark Received
                                                    </Button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

                <div className="space-y-6 pb-[calc(5.5rem+env(safe-area-inset-bottom))] md:pb-8">
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

            {/* Past Orders Section */}
            {pastOrders.length > 0 && (
                <div className="bg-white rounded-[2rem] p-6 shadow-sm border border-slate-200">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-gray-500 to-slate-600 flex items-center justify-center text-white">
                            <CheckCircle size={20} />
                        </div>
                        <h3 className="text-lg font-bold">Past Orders</h3>
                    </div>
                    <div className="rounded-xl border border-gray-200 overflow-hidden text-sm">
                        <table className="w-full text-left">
                            <thead className="bg-gray-50 border-b border-gray-200 text-gray-500 font-semibold">
                                <tr>
                                    <th className="px-4 py-3">PO Number</th>
                                    <th className="px-4 py-3">Supplier</th>
                                    <th className="px-4 py-3">Status</th>
                                    <th className="px-4 py-3">Total</th>
                                    <th className="px-4 py-3 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100/50">
                                {pastOrders.map((po: PurchaseOrder) => (
                                    <tr key={po.id} className="hover:bg-gray-50/50 transition-colors">
                                        <td className="px-4 py-3 font-medium text-gray-900">{po.id}</td>
                                        <td className="px-4 py-3">{po.supplierName}</td>
                                        <td className="px-4 py-3">
                                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                                                po.status === 'Received' ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-700'
                                            }`}>
                                                {po.status}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 font-medium">৳{po.totalAmount.toFixed(2)}</td>
                                        <td className="px-4 py-3 text-right">
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                className="h-8 gap-2 text-blue-600 border-blue-200 hover:bg-blue-50"
                                                onClick={() => {
                                                    setSelectedPo(po);
                                                    setIsDetailDialogOpen(true);
                                                }}
                                            >
                                                <Eye size={14} /> View
                                            </Button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* PO Detail Dialog */}
            <Dialog open={isDetailDialogOpen} onOpenChange={(open) => {
                setIsDetailDialogOpen(open);
                if (!open) setSelectedPo(null);
            }}>
                <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>Purchase Order Details</DialogTitle>
                    </DialogHeader>
                    {selectedPo && (
                        <div className="space-y-6 py-4">
                            {/* PO Info */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-gray-50 rounded-lg">
                                <div>
                                    <Label className="text-xs text-gray-500">PO Number</Label>
                                    <div className="font-mono font-medium">{selectedPo.id}</div>
                                </div>
                                <div>
                                    <Label className="text-xs text-gray-500">Supplier</Label>
                                    <div className="font-medium">{selectedPo.supplierName}</div>
                                </div>
                                <div>
                                    <Label className="text-xs text-gray-500">Status</Label>
                                    <div>
                                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                                            selectedPo.status === 'Received' ? 'bg-emerald-100 text-emerald-700' :
                                            selectedPo.status === 'Pending' ? 'bg-amber-100 text-amber-700' :
                                            'bg-gray-100 text-gray-700'
                                        }`}>
                                            {selectedPo.status}
                                        </span>
                                    </div>
                                </div>
                                <div>
                                    <Label className="text-xs text-gray-500">Expected Delivery</Label>
                                    <div className="font-medium">
                                        {selectedPo.expectedDeliveryDate 
                                            ? new Date(selectedPo.expectedDeliveryDate).toLocaleDateString() 
                                            : 'Not specified'}
                                    </div>
                                </div>
                                <div className="md:col-span-2">
                                    <Label className="text-xs text-gray-500">Notes</Label>
                                    <div className="font-medium">
                                        {selectedPo.notes || 'No notes'}
                                    </div>
                                </div>
                                <div>
                                    <Label className="text-xs text-gray-500">Total Amount</Label>
                                    <div className="text-xl font-bold text-gray-900">৳{selectedPo.totalAmount.toFixed(2)}</div>
                                </div>
                            </div>

                            {/* Items Table */}
                            <div>
                                <Label className="text-sm font-medium mb-2 block">Items</Label>
                                <div className="rounded-xl border border-gray-200 overflow-hidden text-sm">
                                    <table className="w-full text-left">
                                        <thead className="bg-gray-50 border-b border-gray-200 text-gray-500 font-semibold">
                                            <tr>
                                                <th className="px-4 py-3">Inventory Item ID</th>
                                                <th className="px-4 py-3 text-center">Quantity</th>
                                                <th className="px-4 py-3 text-right">Unit Price</th>
                                                <th className="px-4 py-3 text-right">Line Total</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100/50">
                                            {!poItems || poItems.length === 0 ? (
                                                <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-500">No items found</td></tr>
                                            ) : poItems.map((item: PurchaseOrderItem) => (
                                                <tr key={item.id} className="hover:bg-gray-50/50 transition-colors">
                                                    <td className="px-4 py-3 font-mono text-xs">{item.inventoryItemId}</td>
                                                    <td className="px-4 py-3 text-center">{item.quantity}</td>
                                                    <td className="px-4 py-3 text-right">৳{item.unitPrice.toFixed(2)}</td>
                                                    <td className="px-4 py-3 text-right font-medium">৳{(item.quantity * item.unitPrice).toFixed(2)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                            {/* Mark Received Button (for active orders) */}
                            {selectedPo.status !== 'Received' && selectedPo.status !== 'Cancelled' && (
                                <div className="pt-4 border-t border-gray-200">
                                    <Button
                                        variant="outline"
                                        className="w-full gap-2 text-emerald-600 border-emerald-200 hover:bg-emerald-50"
                                        onClick={() => {
                                            receivePoMutation.mutate(selectedPo.id);
                                            setIsDetailDialogOpen(false);
                                        }}
                                        disabled={receivePoMutation.isPending}
                                    >
                                        <CheckCircle size={16} /> Mark as Received
                                    </Button>
                                </div>
                            )}
                        </div>
                    )}
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsDetailDialogOpen(false)}>
                            Close
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={isCreateDialogOpen} onOpenChange={(open) => {
                setIsCreateDialogOpen(open);
                if (!open) resetForm();
            }}>
                <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>Create Purchase Order</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-6 py-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="supplierName">Supplier Name *</Label>
                                <Input
                                    id="supplierName"
                                    value={supplierName}
                                    onChange={(e) => setSupplierName(e.target.value)}
                                    placeholder="e.g., Samsung Electronics"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="expectedDeliveryDate">Expected Delivery Date</Label>
                                <Input
                                    id="expectedDeliveryDate"
                                    type="date"
                                    value={expectedDeliveryDate}
                                    onChange={(e) => setExpectedDeliveryDate(e.target.value)}
                                />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="notes">Notes</Label>
                            <textarea
                                id="notes"
                                value={notes}
                                onChange={(e) => setNotes(e.target.value)}
                                placeholder="Additional notes..."
                                className="w-full min-h-[80px] rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            />
                        </div>

                        <div className="space-y-3">
                            <div className="flex items-center justify-between">
                                <Label>Items *</Label>
                                <Button type="button" variant="outline" size="sm" onClick={addItem} className="gap-1">
                                    <Plus size={14} /> Add Item
                                </Button>
                            </div>

                            {items.length === 0 ? (
                                <div className="border-2 border-dashed border-gray-200 rounded-lg p-8 text-center text-gray-500">
                                    No items added. Click "Add Item" to start.
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {items.map((item, index) => (
                                        <div key={index} className="flex gap-3 p-3 border border-gray-200 rounded-lg bg-gray-50/50">
                                            <div className="flex-1 space-y-1">
                                                <Label className="text-xs">Inventory Item *</Label>
                                                <Select
                                                    value={item.inventoryItemId}
                                                    onValueChange={(value) => updateItem(index, 'inventoryItemId', value)}
                                                >
                                                    <SelectTrigger className="w-full">
                                                        <SelectValue placeholder="Select item..." />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        {(inventoryItems || []).map((inv: any) => (
                                                            <SelectItem key={inv.id} value={inv.id}>
                                                                {inv.name} ({inv.stock ?? 0} in stock)
                                                            </SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                            <div className="w-24 space-y-1">
                                                <Label className="text-xs">Qty *</Label>
                                                <Input
                                                    type="number"
                                                    min="1"
                                                    value={item.quantity}
                                                    onChange={(e) => updateItem(index, 'quantity', parseInt(e.target.value) || 0)}
                                                />
                                            </div>
                                            <div className="w-32 space-y-1">
                                                <Label className="text-xs">Unit Price *</Label>
                                                <Input
                                                    type="number"
                                                    min="0"
                                                    step="0.01"
                                                    value={item.unitPrice}
                                                    onChange={(e) => updateItem(index, 'unitPrice', parseFloat(e.target.value) || 0)}
                                                />
                                            </div>
                                            <div className="flex items-end">
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="icon"
                                                    onClick={() => removeItem(index)}
                                                    className="text-red-500 hover:text-red-700 hover:bg-red-50"
                                                >
                                                    <Trash2 size={16} />
                                                </Button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {items.length > 0 && (
                                <div className="flex justify-end pt-3 border-t border-gray-200">
                                    <div className="text-right">
                                        <div className="text-sm text-gray-500">Total Amount</div>
                                        <div className="text-2xl font-bold text-gray-900">৳{totalAmount.toFixed(2)}</div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => { resetForm(); setIsCreateDialogOpen(false); }}>
                            Cancel
                        </Button>
                        <Button
                            onClick={handleSubmit}
                            disabled={createPoMutation.isPending || !supplierName.trim() || items.length === 0}
                            className="bg-[#52D3D8] hover:bg-[#38bdf8] text-white"
                        >
                            {createPoMutation.isPending ? 'Creating...' : 'Create Purchase Order'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
