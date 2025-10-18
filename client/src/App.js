import { Routes, Route, Navigate } from "react-router-dom";
import UnifiedDashboard from "./App.jsx";
import ProtectedRoute from './components/ProtectedRoute';
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import ForgotPasswordPage from "./pages/ForgotPasswordPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";

function App() {
  return (
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          {/* Specific ARR route removed — unified dashboard handles /dashboard/arr via the wildcard route below */}
          <Route path="/dashboard/*" element={<ProtectedRoute><UnifiedDashboard /></ProtectedRoute>} />
          {/* Redirect root → dashboard/home */}
          <Route path="*" element={<Navigate to="/dashboard/home" replace />} />
        </Routes>
  );
}

export default App;
