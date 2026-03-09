import { useState, useCallback } from "react";
import { motion, Reorder, AnimatePresence } from "framer-motion";
import { GripVertical, Trash2, Plus, X } from "lucide-react";
import { BentoCard } from "../shared";
import {
    draggableItemVariants,
    dropZoneVariants,
    placeholderVariants,
    swipeToDeleteVariants,
    grabCursor,
    grabbingCursor,
    isDragDistanceEnough,
    dragHandleVariants
} from "../shared/animations";

// Demo data type
interface DemoItem {
    id: string;
    title: string;
    description: string;
    order: number;
}

// Sample initial data
const initialItems: DemoItem[] = [
    { id: "1", title: "Service Request", description: "Handle incoming service requests", order: 1 },
    { id: "2", title: "Job Tickets", description: "Manage repair job tickets", order: 2 },
    { id: "3", title: "Inventory", description: "Track parts and stock", order: 3 },
    { id: "4", title: "Finance", description: "Financial transactions", order: 4 },
    { id: "5", title: "Corporate", description: "B2B client management", order: 5 },
];

export default function DragDropDemo() {
    const [items, setItems] = useState<DemoItem[]>(initialItems);
    const [isReordering, setIsReordering] = useState(false);
    const [showDropZone, setShowDropZone] = useState(false);

    // Handle reorder
    const handleReorder = useCallback((newOrder: DemoItem[]) => {
        setItems(newOrder.map((item, index) => ({ ...item, order: index + 1 })));
    }, []);

    // Handle drag start
    const handleDragStart = useCallback(() => {
        setIsReordering(true);
    }, []);

    // Handle drag end
    const handleDragEnd = useCallback(() => {
        setIsReordering(false);
    }, []);

    // Handle swipe to delete
    const [deletingId, setDeletingId] = useState<string | null>(null);

    const handleSwipeDelete = useCallback((id: string) => {
        setDeletingId(id);
        setTimeout(() => {
            setItems(prev => prev.filter(item => item.id !== id));
            setDeletingId(null);
        }, 300);
    }, []);

    // Handle drop from outside
    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setShowDropZone(false);
        // Handle external drop logic here
    }, []);

    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setShowDropZone(true);
    }, []);

    const handleDragLeave = useCallback(() => {
        setShowDropZone(false);
    }, []);

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold text-slate-800">Drag & Drop Demo</h2>
                    <p className="text-slate-500 mt-1">Reorder items by dragging, or swipe to delete</p>
                </div>
                <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl font-medium"
                >
                    <Plus size={18} />
                    Add Item
                </motion.button>
            </div>

            {/* Drag & Drop Zone */}
            <motion.div
                variants={dropZoneVariants}
                initial="idle"
                animate={showDropZone ? "active" : "idle"}
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                className="relative min-h-[400px]"
            >
                <Reorder.Group
                    axis="y"
                    values={items}
                    onReorder={handleReorder}
                    className="space-y-3"
                >
                    <AnimatePresence mode="popLayout">
                        {items.map((item) => (
                            <Reorder.Item
                                key={item.id}
                                value={item}
                                initial="idle"
                                whileDrag="drag"
                                whileHover="hover"
                                dragListener={!deletingId}
                                onDragStart={handleDragStart}
                                onDragEnd={handleDragEnd}
                                variants={draggableItemVariants}
                                style={grabCursor}
                            >
                                <motion.div
                                    variants={swipeToDeleteVariants}
                                    initial="idle"
                                    animate={deletingId === item.id ? "deleting" : "idle"}
                                    drag="x"
                                    dragConstraints={{ left: 0, right: 0 }}
                                    onDragEnd={(e, info) => {
                                        if (isDragDistanceEnough(info, 80)) {
                                            handleSwipeDelete(item.id);
                                        }
                                    }}
                                >
                                    <BentoCard
                                        className="!p-4 cursor-grab active:cursor-grabbing"
                                        variant="glass"
                                    >
                                        <div className="flex items-center gap-4">
                                            {/* Drag Handle */}
                                            <motion.div
                                                variants={dragHandleVariants}
                                                initial="idle"
                                                whileHover="hover"
                                                whileTap="active"
                                                className="cursor-grab"
                                            >
                                                <GripVertical size={20} />
                                            </motion.div>

                                            {/* Content */}
                                            <div className="flex-1">
                                                <h3 className="font-semibold text-slate-800">{item.title}</h3>
                                                <p className="text-sm text-slate-500">{item.description}</p>
                                            </div>

                                            {/* Order Number */}
                                            <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold text-sm">
                                                {item.order}
                                            </div>

                                            {/* Delete Button */}
                                            <motion.button
                                                whileHover={{ scale: 1.1 }}
                                                whileTap={{ scale: 0.9 }}
                                                onClick={() => handleSwipeDelete(item.id)}
                                                className="p-2 text-slate-400 hover:text-red-500 transition-colors"
                                            >
                                                <Trash2 size={18} />
                                            </motion.button>
                                        </div>

                                        {/* Drag Indicator */}
                                        <motion.div
                                            initial={{ opacity: 0 }}
                                            whileDrag={{ opacity: 1 }}
                                            className="absolute inset-0 border-2 border-blue-500 rounded-[2rem] pointer-events-none"
                                        />
                                    </BentoCard>

                                    {/* Swipe Delete Hint */}
                                    <motion.div
                                        className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-full pl-4"
                                        initial={{ opacity: 0 }}
                                        whileHover={{ opacity: 1 }}
                                    >
                                        <div className="bg-red-500 text-white px-3 py-2 rounded-lg text-sm font-medium flex items-center gap-1">
                                            <Trash2 size={14} />
                                            Swipe to delete
                                        </div>
                                    </motion.div>
                                </motion.div>
                            </Reorder.Item>
                        ))}
                    </AnimatePresence>
                </Reorder.Group>

                {/* Empty State */}
                {items.length === 0 && (
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="flex flex-col items-center justify-center py-16"
                    >
                        <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-4">
                            <Trash2 size={32} className="text-slate-400" />
                        </div>
                        <h3 className="text-lg font-semibold text-slate-800">All items deleted</h3>
                        <p className="text-slate-500 mt-1">Click "Add Item" to start over</p>
                    </motion.div>
                )}

                {/* Drop Zone Overlay */}
                <AnimatePresence>
                    {showDropZone && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="absolute inset-0 border-2 border-dashed border-blue-500 bg-blue-50/50 rounded-3xl flex items-center justify-center pointer-events-none"
                        >
                            <div className="text-center">
                                <Plus size={48} className="mx-auto text-blue-500 mb-2" />
                                <p className="text-blue-600 font-medium">Drop here to add</p>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Placeholder when dragging */}
                <motion.div
                    variants={placeholderVariants}
                    initial="idle"
                    animate={isReordering ? "drag" : "idle"}
                    className="h-24 rounded-[2rem] border-2 border-dashed border-slate-300"
                />
            </motion.div>

            {/* Instructions */}
            <BentoCard variant="glass" className="!p-4">
                <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center shrink-0">
                        <GripVertical size={16} />
                    </div>
                    <div>
                        <h4 className="font-semibold text-slate-800">How to use</h4>
                        <ul className="text-sm text-slate-500 mt-1 space-y-1">
                            <li>• Drag the grip icon to reorder items</li>
                            <li>• Swipe left on an item to reveal delete action</li>
                            <li>• Or click the trash icon to delete</li>
                            <li>• Drop zone appears when dragging external content</li>
                        </ul>
                    </div>
                </div>
            </BentoCard>
        </div>
    );
}
