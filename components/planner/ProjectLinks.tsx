import {
  PROJECT_BUG_REPORT_URL,
  PROJECT_FEATURE_REQUEST_URL,
  PROJECT_REPO_URL,
} from "@/lib/project";
import { Icon } from "./Icons";

const links = [
  { href: PROJECT_REPO_URL, label: "View source code" },
  { href: PROJECT_BUG_REPORT_URL, label: "Report a bug" },
  { href: PROJECT_FEATURE_REQUEST_URL, label: "Request a feature" },
] as const;

export function ProjectLinks() {
  return (
    <nav aria-label="Project links" className="project-links">
      {links.map((link) => (
        <a
          key={link.href}
          className="secondary-button project-link-button"
          href={link.href}
          rel="noreferrer"
          target="_blank"
        >
          {link.label}
          <Icon name="external" size={12} />
        </a>
      ))}
    </nav>
  );
}
