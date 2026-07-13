import { Settings, HardHat, UserCheck, ClipboardList, BarChart3, Activity, ShieldAlert, DollarSign, Users2, Users, Package, FileText, MessageSquare, ShoppingCart, Truck, Building2, Receipt, ShoppingBag } from "lucide-react";

// Desktop full-bleed hero prefers technician/workshop imagery with right-weighted subject room.
// Higher-res params for above-the-fold cover crop; CMS hero_images still override at runtime.
const heroImage = "https://images.unsplash.com/photo-1593642532400-2682810df593?auto=format&fit=crop&w=1600&q=80";
const repairImage = "https://images.unsplash.com/photo-1581092160562-40aa08e78837?auto=format&fit=crop&w=1800&q=80";
const tvImage = "https://images.unsplash.com/photo-1593784991095-a205069470b6?auto=format&fit=crop&w=1600&q=80";
const logoImage = "/logo.png";
const showroomImage = "https://images.unsplash.com/photo-1531829722641-0e2c9fa36036?auto=format&fit=crop&w=1600&q=80";

export const navItems = [
  { label: "Home", href: "/home" },
  { label: "Shop", href: "/shop" },
  { label: "Services", href: "/services" },
  { label: "Track Order", href: "/track-order" },
];

export const adminNavGroups = [
  {
    title: "Overview",
    items: [
      { label: "Dashboard", href: "/admin", icon: BarChart3 },
      { label: "Overview", href: "/admin/overview", icon: Activity },
      { label: "System Health", href: "/admin/system-health", icon: ShieldAlert },
    ]
  },
  {
    title: "Operations",
    items: [
      { label: "Service Requests", href: "/admin/service-requests", icon: MessageSquare },
      { label: "Job Tickets", href: "/admin/jobs", icon: ClipboardList },
      { label: "Pickup Schedule", href: "/admin/pickup-schedule", icon: Truck },
      { label: "Challans", href: "/admin/challan", icon: Truck },
    ]
  },
  {
    title: "Sales & Finance",
    items: [
      { label: "POS System", href: "/admin/pos", icon: ShoppingCart },
      { label: "Cashier Dashboard", href: "/admin/cashier", icon: DollarSign },
      { label: "Shop Orders", href: "/admin/orders", icon: ShoppingBag },
      { label: "Inventory", href: "/admin/inventory", icon: Package },
      { label: "Finance & Due", href: "/admin/finance", icon: DollarSign },
    ]
  },
  {
    title: "People & Staff",
    items: [
      { label: "Customers", href: "/admin/customers", icon: Users2 },
      { label: "Staff Attendance", href: "/admin/staff-attendance", icon: UserCheck },
      { label: "Salary & HR", href: "/admin/salary", icon: Receipt },
      { label: "Users", href: "/admin/users", icon: Users },
      { label: "Technician View", href: "/admin/technician", icon: HardHat },
    ]
  },
  {
    title: "Corporate B2B",
    items: [
      { label: "Manage Clients", href: "/admin/corporate", icon: Building2 },
      { label: "Corporate Messages", href: "/admin/corporate-messages", icon: MessageSquare },
    ]
  },
  {
    title: "System",
    items: [
      { label: "Work Reports", href: "/admin/reports", icon: FileText },
      { label: "Inquiries", href: "/admin/inquiries", icon: MessageSquare },
      { label: "Settings", href: "/admin/settings", icon: Settings },
    ]
  }
];

export const adminNavItems = adminNavGroups.flatMap(g => g.items);

export const images = {
  hero: heroImage,
  repair: repairImage,
  tv: tvImage,
  logo: logoImage,
  showroom: showroomImage,
};
