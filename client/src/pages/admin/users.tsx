import { useState } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Search, UserPlus, MoreHorizontal, Shield, Mail, Loader2, Trash2, Edit, Eye, EyeOff } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { adminUsersApi, type SafeUser } from "@/lib/api";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { toast } from "sonner";
import { format } from "date-fns";
import type { UserPermissions } from "@shared/schema";

const ROLES = ["Super Admin", "Manager", "Cashier", "Technician"] as const;

const DEFAULT_PERMISSIONS: Record<string, UserPermissions> = {
  "Super Admin": {
    dashboard: true, jobs: true, inventory: true, pos: true, challans: true,
    finance: true, attendance: true, reports: true, serviceRequests: true,
    users: true, settings: true, canCreate: true, canEdit: true, canDelete: true, canExport: true,
    canViewFullJobDetails: true, canPrintJobTickets: true,
  },
  "Manager": {
    dashboard: true, jobs: true, inventory: true, pos: true, challans: true,
    finance: true, attendance: true, reports: true, serviceRequests: true,
    users: false, settings: false, canCreate: true, canEdit: true, canDelete: false, canExport: true,
    canViewFullJobDetails: true, canPrintJobTickets: true,
  },
  "Cashier": {
    dashboard: true, jobs: false, inventory: true, pos: true, challans: false,
    finance: false, attendance: true, reports: false, serviceRequests: false,
    users: false, settings: false, canCreate: true, canEdit: false, canDelete: false, canExport: false,
    canViewFullJobDetails: false, canPrintJobTickets: false,
  },
  "Technician": {
    dashboard: true, jobs: true, inventory: false, pos: false, challans: true,
    finance: false, attendance: true, reports: false, serviceRequests: true,
    users: false, settings: false, canCreate: false, canEdit: true, canDelete: false, canExport: false,
    canViewFullJobDetails: false, canPrintJobTickets: false,
  },
};

const PERMISSION_LABELS: Record<keyof UserPermissions, string> = {
  dashboard: "Dashboard",
  jobs: "Job Management",
  inventory: "Inventory",
  pos: "Point of Sale",
  challans: "Challans",
  finance: "Finance",
  attendance: "Attendance",
  reports: "Reports",
  serviceRequests: "Service Requests",
  users: "User Management",
  settings: "Settings",
  canCreate: "Can Create",
  canEdit: "Can Edit",
  canDelete: "Can Delete",
  canExport: "Can Export",
  canViewFullJobDetails: "View Full Job Details",
  canPrintJobTickets: "Print Job Tickets",
};

export default function AdminUsersPage() {
  const queryClient = useQueryClient();
  const { user: currentUser, hasPermission } = useAdminAuth();
  const [searchTerm, setSearchTerm] = useState("");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isPermissionsOpen, setIsPermissionsOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<SafeUser | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const [formData, setFormData] = useState({
    username: "",
    name: "",
    email: "",
    password: "",
    role: "Cashier" as typeof ROLES[number],
  });

  const [editPermissions, setEditPermissions] = useState<UserPermissions>({});

  const { data: users = [], isLoading, isError, error, refetch } = useQuery({
    queryKey: ["admin-users"],
    queryFn: adminUsersApi.getAll,
    enabled: !!currentUser,
    retry: false,
  });

  const createMutation = useMutation({
    mutationFn: adminUsersApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      toast.success("User created successfully");
      setIsCreateOpen(false);
      resetForm();
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof adminUsersApi.update>[1] }) =>
      adminUsersApi.update(id, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      if (variables.data.permissions) {
        toast.success("Permissions updated successfully");
        setIsPermissionsOpen(false);
      } else {
        toast.success("User updated successfully");
        setIsEditOpen(false);
      }
      setSelectedUser(null);
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to update user. Please try again.");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: adminUsersApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      toast.success("User deleted successfully");
      setIsDeleteOpen(false);
      setSelectedUser(null);
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const resetForm = () => {
    setFormData({ username: "", name: "", email: "", password: "", role: "Cashier" });
    setShowPassword(false);
  };

  const handleCreate = () => {
    if (!formData.username || !formData.name || !formData.email || !formData.password) {
      toast.error("Please fill in all fields");
      return;
    }
    createMutation.mutate({
      ...formData,
      permissions: JSON.stringify(DEFAULT_PERMISSIONS[formData.role]),
    });
  };

  const handleEdit = () => {
    if (!selectedUser) return;
    const updates: Parameters<typeof adminUsersApi.update>[1] = {};
    if (formData.name && formData.name !== selectedUser.name) updates.name = formData.name;
    if (formData.email && formData.email !== selectedUser.email) updates.email = formData.email;
    if (formData.username && formData.username !== selectedUser.username) updates.username = formData.username;
    if (formData.role && formData.role !== selectedUser.role) updates.role = formData.role;
    if (formData.password) updates.password = formData.password;
    updateMutation.mutate({ id: selectedUser.id, data: updates });
  };

  const handleSavePermissions = () => {
    if (!selectedUser) return;
    if (currentUser?.role !== "Super Admin") {
      toast.error("Only Super Admins can save permission changes");
      return;
    }
    updateMutation.mutate({
      id: selectedUser.id,
      data: { permissions: JSON.stringify(editPermissions) },
    });
  };

  const handleToggleStatus = (user: SafeUser) => {
    const newStatus = user.status === "Active" ? "Inactive" : "Active";
    updateMutation.mutate({ id: user.id, data: { status: newStatus } });
  };

  const openEditDialog = (user: SafeUser) => {
    setSelectedUser(user);
    setFormData({
      username: user.username,
      name: user.name,
      email: user.email,
      password: "",
      role: user.role as typeof ROLES[number],
    });
    setIsEditOpen(true);
  };

  const openPermissionsDialog = (user: SafeUser) => {
    if (currentUser?.role !== "Super Admin") {
      toast.error("Only Super Admins can edit user permissions");
      return;
    }
    setSelectedUser(user);
    try {
      const perms = typeof user.permissions === "string" ? JSON.parse(user.permissions) : user.permissions;
      setEditPermissions(perms || DEFAULT_PERMISSIONS[user.role]);
    } catch {
      setEditPermissions(DEFAULT_PERMISSIONS[user.role]);
    }
    setIsPermissionsOpen(true);
  };

  const getInitials = (name: string) => {
    return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
  };

  const filteredUsers = users.filter((user) =>
    user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.username.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const isSuperAdmin = currentUser?.role === "Super Admin";

  return (
    <AdminLayout>
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-heading font-bold">User Management</h1>
            <p className="text-muted-foreground">Manage system access and user roles.</p>
          </div>
          {isSuperAdmin && (
            <Button className="gap-2" onClick={() => setIsCreateOpen(true)} data-testid="button-add-user">
              <UserPlus className="w-4 h-4" /> Add New User
            </Button>
          )}
        </div>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
            <div>
              <CardTitle>Staff Directory</CardTitle>
              <CardDescription>List of all system users ({users.length} total).</CardDescription>
            </div>
            <div className="relative w-64">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search users..."
                className="pl-8"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                data-testid="input-search-users"
              />
            </div>
          </CardHeader>
          <CardContent>
            {!currentUser ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Shield className="w-12 h-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium mb-2">Authentication Required</h3>
                <p className="text-muted-foreground mb-4">Please log in to view user data.</p>
                <Button variant="outline" onClick={() => window.location.href = "/admin/login"}>
                  Go to Login
                </Button>
              </div>
            ) : isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
            ) : isError ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Shield className="w-12 h-12 text-destructive mb-4" />
                <h3 className="text-lg font-medium mb-2">Failed to Load Users</h3>
                <p className="text-muted-foreground mb-4">{error?.message || "An error occurred while loading users."}</p>
                <Button variant="outline" onClick={() => refetch()}>
                  Try Again
                </Button>
              </div>
            ) : users.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <UserPlus className="w-12 h-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium mb-2">No Users Found</h3>
                <p className="text-muted-foreground mb-4">There are no users in the system yet.</p>
                {isSuperAdmin && (
                  <Button onClick={() => setIsCreateOpen(true)}>
                    <UserPlus className="w-4 h-4 mr-2" /> Add First User
                  </Button>
                )}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[250px]">User</TableHead>
                    <TableHead>Username</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Last Login</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredUsers.map((user) => (
                    <TableRow key={user.id} data-testid={`row-user-${user.id}`}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar>
                            <AvatarFallback>{getInitials(user.name)}</AvatarFallback>
                          </Avatar>
                          <div className="flex flex-col">
                            <span className="font-medium">{user.name}</span>
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              <Mail className="w-3 h-3" /> {user.email}
                            </span>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-sm">{user.username}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Shield className="w-3 h-3 text-muted-foreground" />
                          <span>{user.role}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={user.status === "Active" ? "default" : "secondary"}
                          className={user.status === "Active" ? "bg-green-600" : ""}
                        >
                          {user.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {user.lastLogin ? format(new Date(user.lastLogin), "MMM d, yyyy h:mm a") : "Never"}
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" data-testid={`button-actions-${user.id}`}>
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuLabel>Actions</DropdownMenuLabel>
                            {isSuperAdmin && (
                              <>
                                <DropdownMenuItem onClick={() => openEditDialog(user)}>
                                  <Edit className="w-4 h-4 mr-2" /> Edit User
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => openPermissionsDialog(user)}>
                                  <Shield className="w-4 h-4 mr-2" /> Edit Permissions
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={() => handleToggleStatus(user)}>
                                  {user.status === "Active" ? "Deactivate" : "Activate"} User
                                </DropdownMenuItem>
                                {user.id !== currentUser?.id && (
                                  <DropdownMenuItem
                                    className="text-destructive"
                                    onClick={() => { setSelectedUser(user); setIsDeleteOpen(true); }}
                                  >
                                    <Trash2 className="w-4 h-4 mr-2" /> Delete User
                                  </DropdownMenuItem>
                                )}
                              </>
                            )}
                            {!isSuperAdmin && user.id === currentUser?.id && (
                              <DropdownMenuItem onClick={() => openEditDialog(user)}>
                                <Edit className="w-4 h-4 mr-2" /> Change Password
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Create User Dialog */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Add New User</DialogTitle>
            <DialogDescription>Create a new user account with role-based permissions.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                value={formData.username}
                onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                placeholder="johndoe"
                data-testid="input-new-username"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="name">Full Name</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="John Doe"
                data-testid="input-new-name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                placeholder="john@promise-electronics.com"
                data-testid="input-new-email"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  placeholder="Min 6 characters"
                  className="pr-10"
                  data-testid="input-new-password"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0 h-full"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="role">Role</Label>
              <Select
                value={formData.role}
                onValueChange={(value) => setFormData({ ...formData, role: value as typeof ROLES[number] })}
              >
                <SelectTrigger data-testid="select-new-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLES.filter(r => r !== "Super Admin").map((role) => (
                    <SelectItem key={role} value={role}>{role}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setIsCreateOpen(false); resetForm(); }}>Cancel</Button>
            <Button onClick={handleCreate} disabled={createMutation.isPending} data-testid="button-create-user">
              {createMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Create User
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit User Dialog */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Edit User</DialogTitle>
            <DialogDescription>Update user information and credentials.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {isSuperAdmin && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="edit-username">Username</Label>
                  <Input
                    id="edit-username"
                    value={formData.username}
                    onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                    data-testid="input-edit-username"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-name">Full Name</Label>
                  <Input
                    id="edit-name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    data-testid="input-edit-name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-email">Email</Label>
                  <Input
                    id="edit-email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    data-testid="input-edit-email"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-role">Role</Label>
                  <Select
                    value={formData.role}
                    onValueChange={(value) => setFormData({ ...formData, role: value as typeof ROLES[number] })}
                  >
                    <SelectTrigger data-testid="select-edit-role">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ROLES.map((role) => (
                        <SelectItem key={role} value={role}>{role}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}
            <div className="space-y-2">
              <Label htmlFor="edit-password">New Password (leave blank to keep current)</Label>
              <div className="relative">
                <Input
                  id="edit-password"
                  type={showPassword ? "text" : "password"}
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  placeholder="Enter new password"
                  className="pr-10"
                  data-testid="input-edit-password"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0 h-full"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setIsEditOpen(false); setSelectedUser(null); resetForm(); }}>Cancel</Button>
            <Button onClick={handleEdit} disabled={updateMutation.isPending} data-testid="button-save-user">
              {updateMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Permissions Dialog */}
      <Dialog open={isPermissionsOpen} onOpenChange={setIsPermissionsOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Edit Permissions</DialogTitle>
            <DialogDescription>Customize access permissions for {selectedUser?.name}.</DialogDescription>
          </DialogHeader>
          <div className="py-4 max-h-[400px] overflow-y-auto">
            <div className="space-y-4">
              <div>
                <h4 className="font-medium mb-2">Tab Access</h4>
                <div className="grid grid-cols-2 gap-3">
                  {(["dashboard", "jobs", "inventory", "pos", "challans", "finance", "attendance", "reports", "serviceRequests", "users", "settings"] as const).map((key) => (
                    <div key={key} className="flex items-center space-x-2">
                      <Checkbox
                        id={`perm-${key}`}
                        checked={editPermissions[key] === true}
                        onCheckedChange={(checked) => setEditPermissions(prev => ({ ...prev, [key]: checked === true }))}
                      />
                      <Label htmlFor={`perm-${key}`} className="text-sm">{PERMISSION_LABELS[key]}</Label>
                    </div>
                  ))}
                </div>
              </div>
              <div className="border-t pt-4">
                <h4 className="font-medium mb-2">Action Permissions</h4>
                <div className="grid grid-cols-2 gap-3">
                  {(["canCreate", "canEdit", "canDelete", "canExport"] as const).map((key) => (
                    <div key={key} className="flex items-center space-x-2">
                      <Checkbox
                        id={`perm-${key}`}
                        checked={editPermissions[key] === true}
                        onCheckedChange={(checked) => setEditPermissions(prev => ({ ...prev, [key]: checked === true }))}
                      />
                      <Label htmlFor={`perm-${key}`} className="text-sm">{PERMISSION_LABELS[key]}</Label>
                    </div>
                  ))}
                </div>
              </div>
              <div className="border-t pt-4">
                <h4 className="font-medium mb-2">Job Ticket Permissions</h4>
                <div className="grid grid-cols-2 gap-3">
                  {(["canViewFullJobDetails", "canPrintJobTickets"] as const).map((key) => (
                    <div key={key} className="flex items-center space-x-2">
                      <Checkbox
                        id={`perm-${key}`}
                        checked={editPermissions[key] === true}
                        onCheckedChange={(checked) => setEditPermissions(prev => ({ ...prev, [key]: checked === true }))}
                      />
                      <Label htmlFor={`perm-${key}`} className="text-sm">{PERMISSION_LABELS[key]}</Label>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setIsPermissionsOpen(false); setSelectedUser(null); }}>Cancel</Button>
            <Button onClick={handleSavePermissions} disabled={updateMutation.isPending} data-testid="button-save-permissions">
              {updateMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Save Permissions
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete User</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {selectedUser?.name}? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setSelectedUser(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => selectedUser && deleteMutation.mutate(selectedUser.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminLayout>
  );
}
