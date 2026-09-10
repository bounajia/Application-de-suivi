import type { Project, ProjectStatus, Role } from "./types";
export const STATUS: Record<ProjectStatus, string> = {
  planned: "À démarrer",
  in_progress: "En cours",
  paused: "En pause",
  completed: "Terminé",
};
export const ROLES: Record<Role, string> = {
  admin: "Administrateur",
  user: "Utilisateur",
};
export const ACCOUNT_STATUS = {
  pending: "En attente",
  active: "Actif",
  rejected: "Refusé",
  suspended: "Suspendu",
};
export const DAY = 86_400_000;
export function dayValue(date: string) {
  const [y, m, d] = date.slice(0, 10).split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}
export function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export function duration(p: Pick<Project, "startDate" | "endDate">) {
  const result = Math.round(
    (dayValue(p.endDate) - dayValue(p.startDate)) / DAY,
  );
  return Number.isFinite(result) ? Math.max(0, result) : 0;
}
export function elapsed(p: Pick<Project, "startDate" | "endDate">) {
  const days = duration(p);
  return days === 0
    ? today() >= p.endDate
      ? 100
      : 0
    : Math.min(
        100,
        Math.max(
          0,
          Math.round(
            ((dayValue(today()) - dayValue(p.startDate)) / DAY / days) * 100,
          ),
        ),
      );
}
export function daysLeft(p: Pick<Project, "endDate">) {
  return Math.ceil((dayValue(p.endDate) - dayValue(today())) / DAY);
}
export function remainingLabel(
  p: Pick<Project, "endDate" | "progress" | "status">,
) {
  if (p.status === "completed" || p.progress >= 100) return "Projet terminé";
  const days = daysLeft(p);
  if (days < 0)
    return `${Math.abs(days)} jour${Math.abs(days) > 1 ? "s" : ""} de retard`;
  return `${days} jour${days > 1 ? "s" : ""} restant${days > 1 ? "s" : ""}`;
}
export function isLate(p: Project) {
  return p.status !== "completed" && p.progress < 100 && daysLeft(p) < 0;
}
export function dateLabel(value: string, long = false) {
  if (!value) return "—";
  const d = new Date(value.length === 10 ? `${value}T12:00:00` : value);
  return Number.isNaN(d.getTime())
    ? "—"
    : new Intl.DateTimeFormat("fr-FR", {
        day: "numeric",
        month: long ? "long" : "short",
        year: "numeric",
      }).format(d);
}
export function dateTime(value: string) {
  return `${dateLabel(value)} à ${new Date(value).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`;
}
export function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0])
    .join("")
    .toUpperCase();
}
export function fileSize(size: number) {
  return size >= 1024 * 1024
    ? `${(size / 1024 / 1024).toFixed(1)} Mo`
    : `${Math.max(1, Math.round(size / 1024))} Ko`;
}
