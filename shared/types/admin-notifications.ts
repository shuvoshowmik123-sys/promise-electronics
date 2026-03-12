export type AdminNotificationSource = "service_request" | "stored_notification";

export interface AdminNotificationItem {
  id: string;
  source: AdminNotificationSource;
  type: string;
  title: string;
  message: string;
  createdAt: string;
  read: boolean;
  link: string;
  linkId?: string;
  jobId?: string | null;
}
