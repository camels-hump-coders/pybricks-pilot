import { useCallback, useState } from "react";
import type { NotificationProps } from "../components/ErrorNotification";

let notificationId = 0;

export function useNotifications() {
  const [notifications, setNotifications] = useState<NotificationProps[]>([]);

  const addNotification = useCallback(
    (notification: Omit<NotificationProps, "id" | "onClose">) => {
      const id = String(++notificationId);
      const newNotification: NotificationProps = {
        ...notification,
        id,
      };

      setNotifications((prev) => [...prev, newNotification]);
      return id;
    },
    [],
  );

  const removeNotification = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  const clearAll = useCallback(() => {
    setNotifications([]);
  }, []);

  const showSuccess = useCallback(
    (title: string, message: string, duration?: number) => {
      return addNotification({ type: "success", title, message, duration });
    },
    [addNotification],
  );

  const showError = useCallback(
    (title: string, message: string, duration?: number) => {
      return addNotification({ type: "error", title, message, duration });
    },
    [addNotification],
  );

  const showWarning = useCallback(
    (title: string, message: string, duration?: number) => {
      return addNotification({ type: "warning", title, message, duration });
    },
    [addNotification],
  );

  const showInfo = useCallback(
    (title: string, message: string, duration?: number) => {
      return addNotification({ type: "info", title, message, duration });
    },
    [addNotification],
  );

  return {
    notifications,
    addNotification,
    removeNotification,
    clearAll,
    showSuccess,
    showError,
    showWarning,
    showInfo,
  };
}
