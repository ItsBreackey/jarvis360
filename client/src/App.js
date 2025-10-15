import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import DashboardLayout from "./components/DashboardLayout";
import OverviewSection from "./pages/OverviewSection";
import ForecastSection from "./pages/ForecastSection";
import SimulationSection from "./pages/SimulationSection";
import Settings from "./pages/Settings";
import UnifiedDashboard from "./App";
import { DatasetProvider } from "./context/DatasetContext";

function App() {
  return (
    <DatasetProvider>
      <Router>
        <Routes>
          <Route path="/dashboard" element={<DashboardLayout />}>
            <Route path="home" element={<UnifiedDashboard />} /> {/* homepage */}
            <Route path="overview" element={<OverviewSection />} />
            <Route path="forecast" element={<ForecastSection />} />
            <Route path="simulation" element={<SimulationSection />} />
            <Route path="settings" element={<Settings />} />
          </Route>
          {/* Redirect root → dashboard/home */}
          <Route path="*" element={<Navigate to="/dashboard/home" replace />} />
        </Routes>
      </Router>
    </DatasetProvider>
  );
}

export default App;
