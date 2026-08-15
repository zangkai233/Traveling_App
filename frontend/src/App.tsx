import {
  BrowserRouter,
  Route,
  Routes,
} from "react-router-dom";

import BottomNav from "./components/BottomNav";

import HomePage from "./pages/HomePage";
import GuidePage from "./pages/GuidePage";
import PlannerMapPage from "./pages/PlannerMapPage";
import SettingsPage from "./pages/SettingsPage";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />

        <Route
          path="/guide"
          element={<GuidePage />}
        />

        <Route
          path="/map"
          element={<PlannerMapPage />}
        />

        <Route
          path="/planner"
          element={<PlannerMapPage />}
        />

        <Route
          path="/settings"
          element={<SettingsPage />}
        />
      </Routes>

      <BottomNav />
    </BrowserRouter>
  );
}

export default App;