import { useIDEStore } from "../store";

export default function TitleBar() {
  const { workspacePath } = useIDEStore();
  const folderName = workspacePath.split(/[\\/]/).filter(Boolean).pop() ?? "Nova IDE";

  return (
    <div className="titlebar">
      <div className="titlebar-left">
        <div className="titlebar-logo">N</div>
        <span className="titlebar-title">
          {workspacePath ? `${folderName} — Nova IDE` : "Nova IDE"}
        </span>
      </div>
      <div className="titlebar-center">
        <button className="titlebar-btn">File</button>
        <button className="titlebar-btn">Edit</button>
        <button className="titlebar-btn">View</button>
        <button className="titlebar-btn">Go</button>
        <button className="titlebar-btn">Run</button>
        <button className="titlebar-btn">Help</button>
      </div>
      <div className="titlebar-right">
        <button className="titlebar-window-btn" title="Minimize">&#8211;</button>
        <button className="titlebar-window-btn" title="Maximize">&#9633;</button>
        <button className="titlebar-window-btn close" title="Close">&#10005;</button>
      </div>
    </div>
  );
}
