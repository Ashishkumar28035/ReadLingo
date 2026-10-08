import { Navigate } from "react-router-dom";

function ProtectedRoute({ children }) {
    const token = localStorage.getItem("token");

    if (!token || token === "null" || token === "undefined" || !token.trim()) {
        return <Navigate to="/login" replace />;
    }

    return children;
}

export default ProtectedRoute;
