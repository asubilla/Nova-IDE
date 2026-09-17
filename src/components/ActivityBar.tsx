import { useIDEStore, type SidebarPanel } from "../store";

const icons: Record<string, { icon: string; label: string }> = {
  files: { icon: "\u{1F4C1}", label: "Explorer" },
  search: { icon: "\u{1F50D}", label: "Search" },
  git: { icon: "\u{1F500}", label: "Source Control" },
  extensions: { icon: "\u{1F9E9}", label: "Extensions" },
  ai: { icon: "\u{1F916}", label: "AI Assistant" },
};

const topItems: SidebarPanel[] = ["files", "search", "git", "extensions"];
const bottomItems: SidebarPanel[] = ["ai"];

export default function ActivityBar() {
  const { sidebarPanel, setSidebarPanel } = useIDEStore();

  const renderBtn = (panel: SidebarPanel) => {
    if (!panel) return null;
    const { icon, label } = icons[panel];
    return (
      <button
        key={panel}
        className={`activitybar-btn ${sidebarPanel === panel ? "active" : ""}`}
        title={label}
        onClick={() => setSidebarPanel(panel)}
      >
        {icon}
      </button>
    );
  };

  return (
    <div className="activitybar">
      <div className="activitybar-top">{topItems.map(renderBtn)}</div>
      <div className="activitybar-bottom">{bottomItems.map(renderBtn)}</div>
    </div>
  );
}
