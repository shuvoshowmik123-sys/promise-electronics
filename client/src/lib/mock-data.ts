import { Monitor, Wrench, ShoppingCart, ShoppingBag, Users, Users2, BarChart3, ClipboardList, FileText, Package, Truck, DollarSign, HardHat, Settings, MessageSquare, UserCheck, Activity } from "lucide-react";

// Placeholder images - replace with actual images in production
const heroImage = "https://images.unsplash.com/photo-1593642532400-2682810df593?w=800";
const repairImage = "https://images.unsplash.com/photo-1581092160562-40aa08e78837?w=800";
const tvImage = "https://images.unsplash.com/photo-1593784991095-a205069470b6?w=800";
const logoImage = "/logo.png";
const showroomImage = "https://images.unsplash.com/photo-1531829722641-0e2c9fa36036?w=800";

export const products = [
  {
    id: 1,
    name: "Sony Bravia 55\" 4K Smart LED TV",
    price: "85,000 - 92,000",
    category: "Television",
    image: tvImage,
    rating: 4.8,
    reviews: 124,
  },
  {
    id: 2,
    name: "Samsung Crystal UHD 43\" TV",
    price: "45,000 - 48,000",
    category: "Television",
    image: tvImage,
    rating: 4.6,
    reviews: 89,
  },
  {
    id: 3,
    name: "LG OLED C1 Series 65\"",
    price: "180,000 - 195,000",
    category: "Television",
    image: tvImage,
    rating: 4.9,
    reviews: 56,
  },
  {
    id: 4,
    name: "Universal TV Remote Control",
    price: "500 - 800",
    category: "Accessories",
    image: tvImage, // Placeholder
    rating: 4.2,
    reviews: 340,
  },
];

export const jobs = [
  {
    id: "JOB-2025-001",
    customer: "Rahim Uddin",
    device: "Sony Bravia 55\"",
    issue: "No Display",
    status: "In Progress",
    priority: "High",
    date: "2025-12-01",
    technician: "Karim Hasan",
  },
  {
    id: "JOB-2025-002",
    customer: "Sadia Islam",
    device: "Samsung 43\" LED",
    issue: "Power Issue",
    status: "Pending",
    priority: "Medium",
    date: "2025-12-01",
    technician: "Unassigned",
  },
  {
    id: "JOB-2025-003",
    customer: "Corporate: Hotel Serena",
    device: "Multiple Units (5)",
    issue: "Maintenance",
    status: "Completed",
    priority: "Low",
    date: "2025-11-30",
    technician: "Team A",
  },
];

export const inventoryItems = [
  { id: "INV-001", name: "Sony 55\" LED Panel", category: "Spare Parts", stock: 5, price: 45000, status: "In Stock" },
  { id: "INV-002", name: "Universal Main Board", category: "Spare Parts", stock: 12, price: 3500, status: "In Stock" },
  { id: "INV-003", name: "HDMI Cable (High Speed)", category: "Accessories", stock: 50, price: 450, status: "In Stock" },
  { id: "INV-004", name: "Power Supply Unit (Samsung)", category: "Spare Parts", stock: 2, price: 2800, status: "Low Stock" },
  { id: "INV-005", name: "Remote Control (Smart)", category: "Accessories", stock: 0, price: 850, status: "Out of Stock" },
];

export const challans = [
  { id: "CH-DHA-01-20240001", date: "2025-12-01", receiver: "Hotel Serena", type: "Corporate", status: "Delivered", items: 5 },
  { id: "CH-DHA-01-20240002", date: "2025-12-01", receiver: "Mr. Rahim", type: "Customer", status: "Pending", items: 1 },
  { id: "CH-DHA-01-20240003", date: "2025-11-30", receiver: "Gulshan Branch", type: "Transfer", status: "Received", items: 12 },
];

export const financeRecords = {
  pettyCash: [
    { id: 1, date: "2025-12-01", description: "Lunch for Technicians", category: "Food", amount: -500, type: "Expense" },
    { id: 2, date: "2025-12-01", description: "Service Charge - Job #8892", category: "Service", amount: 1500, type: "Income" },
    { id: 3, date: "2025-11-30", description: "Transport Bill", category: "Transport", amount: -200, type: "Expense" },
  ],
  dueRecords: [
    { id: 1, customer: "Karim Uddin", amount: 5000, date: "2025-11-25", status: "Overdue", invoice: "INV-8821" },
    { id: 2, customer: "Corporate: Hotel Serena", amount: 25000, date: "2025-12-05", status: "Pending", invoice: "INV-8845" },
  ]
};

export const navItems = [
  { label: "Home", href: "/home" },
  { label: "Shop", href: "/shop" },
  { label: "Services", href: "/services" },
  { label: "Track Order", href: "/track-order" },
];

export const adminNavItems = [
  { label: "Dashboard", href: "/admin", icon: BarChart3 },
  { label: "Overview", href: "/admin/overview", icon: Activity },
  { label: "Service Requests", href: "/admin/service-requests", icon: MessageSquare },
  { label: "Pickup Schedule", href: "/admin/pickup-schedule", icon: Truck },
  { label: "Shop Orders", href: "/admin/orders", icon: ShoppingBag },
  { label: "Customers", href: "/admin/customers", icon: Users2 },
  { label: "Job Tickets", href: "/admin/jobs", icon: ClipboardList },
  { label: "POS System", href: "/admin/pos", icon: ShoppingCart },
  { label: "Inventory", href: "/admin/inventory", icon: Package },
  { label: "Challans", href: "/admin/challan", icon: Truck },
  { label: "Finance & Due", href: "/admin/finance", icon: DollarSign },
  { label: "Technician View", href: "/admin/technician", icon: HardHat },
  { label: "Staff Attendance", href: "/admin/staff-attendance", icon: UserCheck },
  { label: "Work Reports", href: "/admin/reports", icon: FileText },
  { label: "Users", href: "/admin/users", icon: Users },
  { label: "Inquiries", href: "/admin/inquiries", icon: MessageSquare },
  { label: "Settings", href: "/admin/settings", icon: Settings },
];

export const images = {
  hero: heroImage,
  repair: repairImage,
  tv: tvImage,
  logo: logoImage,
  showroom: showroomImage,
};

