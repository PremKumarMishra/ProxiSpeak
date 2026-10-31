/**
 * Activity timestamp and relative time formatting utilities for ProxiSpeak.
 */

/**
 * Safely parse a date value from an activity item.
 * Supports Date objects, numbers (ms/seconds), ISO strings, and standard date strings.
 * Returns null if missing, invalid, or already a pre-formatted relative string.
 */
export function parseActivityDate(value) {
  if (value == null) return null;

  if (value instanceof Date) {
    return isNaN(value.getTime()) ? null : value;
  }

  if (typeof value === "number") {
    if (isNaN(value) || !isFinite(value) || value <= 0) return null;
    const ms = value > 1e11 ? value : value * 1000;
    const d = new Date(ms);
    return isNaN(d.getTime()) ? null : d;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;

    // Avoid parsing known relative labels like "Just now", "Yesterday", "Recently", "5m ago"
    if (
      /^(just now|recently|yesterday|\d+\s*(m|min|minute|minutes|h|hour|hours|d|day|days|w|week|weeks)\s*ago)$/i.test(
        trimmed
      )
    ) {
      return null;
    }

    // Try parsing as numeric string (e.g. "1730400000000")
    if (/^\d{10,13}$/.test(trimmed)) {
      const num = Number(trimmed);
      const ms = num > 1e11 ? num : num * 1000;
      const d = new Date(ms);
      if (!isNaN(d.getTime())) return d;
    }

    const d = new Date(trimmed);
    return isNaN(d.getTime()) ? null : d;
  }

  return null;
}

/**
 * Format a Date object into "31 Oct 2026" using the user's local browser timezone.
 */
export function formatActualDate(date) {
  if (!date || !(date instanceof Date) || isNaN(date.getTime())) {
    return "";
  }
  const day = date.getDate();
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  const month = months[date.getMonth()];
  const year = date.getFullYear();
  return `${day} ${month} ${year}`;
}

/**
 * Calculate human-readable relative time using JavaScript Date.
 * E.g. "Just now", "5 minutes ago", "30 minutes ago", "2 hours ago", "Yesterday", "2 days ago", "1 week ago".
 */
export function formatRelativeTime(past, now = new Date()) {
  const diffMs = now.getTime() - past.getTime();
  if (diffMs < -60000) return "Just now";
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 45) return "Just now";

  if (diffSec < 3600) {
    const mins = Math.floor(diffSec / 60);
    return mins <= 1 ? "1 minute ago" : `${mins} minutes ago`;
  }

  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate()
  ).getTime();
  const startOfPast = new Date(
    past.getFullYear(),
    past.getMonth(),
    past.getDate()
  ).getTime();
  const calendarDayDiff = Math.round((startOfToday - startOfPast) / 86400000);

  if (diffSec < 86400 && calendarDayDiff === 0) {
    const hours = Math.floor(diffSec / 3600);
    return hours <= 1 ? "1 hour ago" : `${hours} hours ago`;
  }

  if (calendarDayDiff === 1) {
    const diffHours = Math.floor(diffSec / 3600);
    if (diffHours < 2) return "1 hour ago";
    return "Yesterday";
  }

  if (calendarDayDiff >= 2 && calendarDayDiff < 7) {
    return `${calendarDayDiff} days ago`;
  }

  if (calendarDayDiff >= 7 && calendarDayDiff < 14) {
    return "1 week ago";
  }

  if (calendarDayDiff >= 14 && calendarDayDiff < 30) {
    const weeks = Math.floor(calendarDayDiff / 7);
    return `${weeks} weeks ago`;
  }

  if (calendarDayDiff >= 30 && calendarDayDiff < 60) {
    return "1 month ago";
  }

  if (calendarDayDiff >= 60 && calendarDayDiff < 365) {
    const months = Math.floor(calendarDayDiff / 30);
    return `${months} months ago`;
  }

  const years = Math.floor(calendarDayDiff / 365);
  return years <= 1 ? "1 year ago" : `${years} years ago`;
}

/**
 * Resolves activity timestamp into relative indicator and actual date.
 * Returns safe fallback if timestamp is missing or invalid.
 */
export function getActivityTimeDisplay(item, now = new Date()) {
  if (!item) {
    return { relative: "Recently", actual: "", fullText: "Recently" };
  }

  const rawDate =
    item.createdAt ||
    item.timestamp ||
    item.created_at ||
    item.date ||
    item.time;

  const parsedDate = parseActivityDate(rawDate);

  if (parsedDate) {
    const relative = formatRelativeTime(parsedDate, now);
    const actual = formatActualDate(parsedDate);
    return {
      relative,
      actual,
      fullText: actual ? `${relative} · ${actual}` : relative,
    };
  }

  if (typeof item.timestamp === "string" && item.timestamp.trim()) {
    const trimmed = item.timestamp.trim();
    return {
      relative: trimmed,
      actual: "",
      fullText: trimmed,
    };
  }

  if (typeof item.createdAt === "string" && item.createdAt.trim()) {
    const trimmed = item.createdAt.trim();
    return {
      relative: trimmed,
      actual: "",
      fullText: trimmed,
    };
  }

  return {
    relative: "Recently",
    actual: "",
    fullText: "Recently",
  };
}
