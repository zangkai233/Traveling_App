import {
  Home,
  Map,
  Settings,
  Users,
} from "lucide-react";

import {
  useLocation,
  useNavigate,
} from "react-router-dom";

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
  const location =
    useLocation();

  const navigate =
    useNavigate();


  return (
    <nav className="easy-bottom-nav">

      {items.map(
        (item) => {

          const Icon =
            item.icon;

          const active =
            item.path === "/"
              ? location.pathname === "/"
              : location.pathname.startsWith(
                  item.path,
                ) ||
                (
                  item.path === "/map" &&
                  location.pathname ===
                    "/planner"
                );


          return (
            <button
              key={item.path}
              className={
                active
                  ? "easy-nav-item easy-nav-active"
                  : "easy-nav-item"
              }
              onClick={() =>
                navigate(item.path)
              }
            >

              <Icon
                size={22}
                strokeWidth={
                  active
                    ? 2.4
                    : 1.8
                }
              />

              <span>
                {item.label}
              </span>

            </button>
          );
        },
      )}

    </nav>
  );
}


export default BottomNav;