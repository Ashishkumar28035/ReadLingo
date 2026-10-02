import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import Signup from './pages/Signup';
import Reader from './pages/Reader';
import Vocabulary from './pages/Vocabulary';
import ProtectedRoute from './components/ProtectedRoute';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/reader" replace />} />
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route
          path="/reader"
          element={
            <ProtectedRoute>
              <Reader />
            </ProtectedRoute>
          }
        />
        <Route
          path="/vocabulary"
          element={
            <ProtectedRoute>
              <Vocabulary />
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<Navigate to="/reader" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
