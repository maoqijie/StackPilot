import { BookOpen, CircleHelp, FileBox, Globe2 } from "lucide-react";

function DesktopFooter() {
  const footerLinks = [
    { label: "文档", icon: BookOpen, href: `${__APP_REPOSITORY_URL__}/blob/main/README.md` },
    { label: "GitHub", icon: Globe2, href: __APP_REPOSITORY_URL__ },
    { label: "社区反馈", icon: FileBox, href: `${__APP_REPOSITORY_URL__}/issues` },
    { label: "帮助中心", icon: CircleHelp, href: `${__APP_REPOSITORY_URL__}/blob/main/docs/help.md` },
  ];
  return (
    <footer className="desktop-footer">
      <span>© {new Date().getFullYear()} StackPilot 开源版 v{__APP_VERSION__}</span>
      <nav aria-label="底部资源链接">
        {footerLinks.map(({ label, icon: Icon, href }) => (
          <a key={label} href={href} target="_blank" rel="noreferrer">
            <Icon size={14} aria-hidden="true" />
            <span>{label}</span>
          </a>
        ))}
      </nav>
    </footer>
  );
}

export { DesktopFooter };
