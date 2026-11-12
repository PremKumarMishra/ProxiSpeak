import { useEffect, useState } from "react";
import "./RecentActivity.css";
import {
  parseActivityDate,
  formatActualDate,
  formatRelativeTime,
  getActivityTimeDisplay,
} from "../utils/activityTime";

export {
  parseActivityDate,
  formatActualDate,
  formatRelativeTime,
  getActivityTimeDisplay,
};

export default function RecentActivity({
  activities = [],
  onClearActivity,
  onActivityClick,
}) {
  // Periodically refresh relative time so indicators stay accurate
  const [, setTick] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setTick((prev) => prev + 1);
    }, 30000);
    return () => clearInterval(timer);
  }, []);

  const getIconForType = (type) => {
    switch (type) {
      case "org_created":
        return "＋";
      case "org_joined":
        return "⌑";
      case "member_invited":
        return "✉";
      case "profile_updated":
        return "👤";
      case "status_changed":
        return "●";
      default:
        return "✦";
    }
  };

  const getBadgeClass = (type) => {
    switch (type) {
      case "org_created":
        return "badge-purple";
      case "org_joined":
        return "badge-blue";
      case "member_invited":
        return "badge-green";
      case "profile_updated":
        return "badge-purple";
      default:
        return "badge-gray";
    }
  };

  return (
    <section className="recent-activity-card">
      <div className="recent-activity-header">
        <div>
          <h3>Recent Activity</h3>
          <p>Recent events and team updates in your workspace.</p>
        </div>
        {activities.length > 0 && onClearActivity && (
          <button
            type="button"
            className="recent-activity-clear-btn"
            onClick={onClearActivity}
          >
            Clear log
          </button>
        )}
      </div>

      {activities.length === 0 ? (
        <div className="recent-activity-empty">
          <div className="activity-empty-icon">◖))</div>
          <h4>No recent activity yet</h4>
          <p>
            When you create an organization, invite teammates, or update your
            profile, your activities will appear right here.
          </p>
        </div>
      ) : (
        <div className="recent-activity-list">
          {activities.map((item, idx) => {
            const timeInfo = getActivityTimeDisplay(item);

            return (
              <article
                key={idx}
                className={`recent-activity-item ${
                  onActivityClick ? "clickable" : ""
                }`}
                onClick={() => onActivityClick && onActivityClick(item)}
              >
                <div
                  className={`activity-item-icon ${getBadgeClass(item.type)}`}
                >
                  {getIconForType(item.type)}
                </div>

                <div className="activity-item-content">
                  <div className="activity-item-top">
                    <strong>{item.title}</strong>
                    <span
                      className="activity-time"
                      title={
                        timeInfo.actual
                          ? `${timeInfo.relative} (${timeInfo.actual})`
                          : timeInfo.relative
                      }
                    >
                      <span className="activity-time-relative">
                        {timeInfo.relative}
                      </span>
                      {timeInfo.actual && (
                        <>
                          <span className="activity-time-separator"> · </span>
                          <span className="activity-time-date">
                            {timeInfo.actual}
                          </span>
                        </>
                      )}
                    </span>
                  </div>
                  {item.description && (
                    <p className="activity-item-desc">{item.description}</p>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
