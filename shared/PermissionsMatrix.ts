export type UserRole = 'Super Admin' | 'Manager' | 'Cashier' | 'Technician' | 'Delivery Boy' | 'Customer' | 'Corporate Client';

export type Permission =
    | 'manage_users'
    | 'manage_settings'
    | 'view_all_jobs'
    | 'view_assigned_jobs_only'
    | 'create_job'
    | 'edit_job_status'
    | 'assign_technician'
    | 'process_payment'
    | 'view_financials'
    | 'manage_inventory'
    | 'manage_corporate'
    | 'view_corporate_portal'
    | 'perform_pickup'
    | 'perform_delivery';

export const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
    'Super Admin': [
        'manage_users',
        'manage_settings',
        'view_all_jobs',
        'view_financials',
        'manage_corporate',
        'manage_inventory'
    ],
    'Manager': [
        'view_all_jobs',
        'create_job',
        'edit_job_status', // Only specific transitions (e.g. convert to job)
        'assign_technician',
        'manage_inventory',
        'manage_corporate' // Challans
    ],
    'Cashier': [
        'process_payment',
        'view_financials' // Read-only bills
    ],
    'Technician': [
        'view_assigned_jobs_only',
        'edit_job_status' // Only in_repair -> ready
    ],
    'Delivery Boy': [
        'perform_pickup',
        'perform_delivery'
    ],
    'Customer': [],
    'Corporate Client': [
        'view_corporate_portal'
    ]
};

export const canPerform = (role: UserRole, permission: Permission): boolean => {
    return ROLE_PERMISSIONS[role]?.includes(permission) || false;
};
