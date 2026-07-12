import { BookOpen, CircleHelp, Github, MessageSquareText } from "lucide-react";

function DesktopFooter() {
  const links = [
    { label: "文档", icon: BookOpen, href: `${__APP_REPOSITORY_URL__}/blob/main/README.md` },
    { label: "GitHub", icon: Github, href: __APP_REPOSITORY_URL__ },
    { label: "社区反馈", icon: MessageSquareText, href: `${__APP_REPOSITORY_URL__}/issues` },
    { label: "帮助中心", icon: CircleHelp, href: `${__APP_REPOSITORY_URL__}/blob/main/docs/help.md` },
  ];

  return (
    <footer className="cloud-footer">
      <span className="cloud-footer-product">© {new Date().getFullYear()} StackPilot <span>开源版 v{__APP_VERSION__}</span></span>
      <nav aria-label="底部资源链接">
        {links.map(({ label, icon: Icon, href }) => (
          <a key={label} href={href} target="_blank" rel="noreferrer" aria-label={label} title={label}>
            <Icon size={15} aria-hidden="true" />
            <span>{label}</span>
          </a>
        ))}
      </nav>
    </footer>
  );
}

export { DesktopFooter };
