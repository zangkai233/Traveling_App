import {
  Home,
  Map,
  Settings,
  Users,
} from "lucide-react";

import { useLocation, useNavigate } from "react-router-dom";

import "./BottomNav.css";

const items = [
  {
    path: "/",
    label: "Home",
    icon: Home,
  },
  {
    path: "/guide",
    label: "Guide",
    icon: Users,
  },
  {
    path: "/map",
    label: "Map",
    icon: Map,
  },
  {
    path: "/settings",
    label: "Settings",
    icon: Settings,
  },
];

function BottomNav() {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <nav className="bottom-nav">
      {items.map((item) => {
        const Icon = item.icon;

        const active =
          item.path === "/"
            ? location.pathname === "/"
            : location.pathname.startsWith(item.path);

        return (
          <button
            key={item.path}
            className={
              active
                ? "bottom-nav-item bottom-nav-item-active"
                : "bottom-nav-item"
            }
            onClick={() => navigate(item.path)}
          >
            <Icon size={20} strokeWidth={active ? 2.4 : 1.9} />
            <span>{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

export default BottomNav;