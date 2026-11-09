// Reminders: thin wrapper over expo-notifications (injected, so it can be faked in tests)
// plus a service that keeps tasks and their scheduled notifications in step.

import { newTask, validateTitle } from './tasks.js';

const CHANNEL = 'reminders';

export function createReminders(notifications) {
  return {
    /** Ask for notification permission (and create the Android channel). Returns true if granted. */
    async ensurePermission() {
      try {
        await notifications.setNotificationChannelAsync?.(CHANNEL, {
          name: 'Reminders',
          importance: notifications.AndroidImportance?.HIGH ?? 4,
        });
        let p = await notifications.getPermissionsAsync();
        if (!p.granted) p = await notifications.requestPermissionsAsync();
        return !!p.granted;
      } catch {
        return false;
      }
    },
    /** Schedule a one-off notification. Returns its id, or null if it could not be scheduled. */
    async schedule({ title, body, at, taskId }) {
      try {
        return await notifications.scheduleNotificationAsync({
          content: { title, body, data: { taskId }, sound: true },
          trigger: {
            type: notifications.SchedulableTriggerInputTypes?.DATE ?? 'date',
            date: new Date(at),
            channelId: CHANNEL,
          },
        });
      } catch {
        return null;
      }
    },
    async cancel(notificationId) {
      if (!notificationId) return;
      try {
        await notifications.cancelScheduledNotificationAsync(notificationId);
      } catch {
        /* already gone */
      }
    },
  };
}

const NO_PERMISSION = 'Notifications are turned off for this app, so no reminder will sound. Turn them on in Android settings.';
const NOT_SCHEDULED = 'The reminder could not be scheduled on this phone. The task is saved.';

export function createTaskService({ store, reminders, now = () => Date.now(), makeId }) {
  // Cancel any old notification, then schedule a new one if the task has a future due time.
  async function syncReminder(task) {
    await reminders.cancel(task.notificationId);
    task.notificationId = null;
    if (task.done || task.dueAt == null || task.dueAt <= now()) return null;
    if (!(await reminders.ensurePermission())) return NO_PERMISSION;
    const id = await reminders.schedule({ title: 'Reminder', body: task.title, at: task.dueAt, taskId: task.id });
    if (!id) return NOT_SCHEDULED;
    task.notificationId = id;
    return null;
  }

  return {
    async add({ title, notes, dueAt, priority }) {
      const v = validateTitle(title);
      if (!v.ok) return { ok: false, message: v.message };
      const task = newTask({ id: makeId(), title: v.title, notes, dueAt, priority }, now());
      const warning = await syncReminder(task);
      await store.save(task);
      return { ok: true, task, warning };
    },
    async update(id, patch) {
      const task = await store.get(id);
      if (!task) return { ok: false, message: 'Task not found.' };
      if (patch.title !== undefined) {
        const v = validateTitle(patch.title);
        if (!v.ok) return { ok: false, message: v.message };
        patch = { ...patch, title: v.title };
      }
      Object.assign(task, patch);
      const warning = await syncReminder(task);
      await store.save(task);
      return { ok: true, task, warning };
    },
    async toggleDone(id) {
      const task = await store.get(id);
      if (!task) return { ok: false, message: 'Task not found.' };
      task.done = !task.done;
      task.completedAt = task.done ? now() : null;
      const warning = await syncReminder(task);
      await store.save(task);
      return { ok: true, task, warning };
    },
    async remove(id) {
      const task = await store.get(id);
      if (task) await reminders.cancel(task.notificationId);
      await store.remove(id);
      return { ok: true };
    },
  };
}
