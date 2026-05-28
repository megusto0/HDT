import { Navigate, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import GameDetail from './pages/GameDetail';
import Games from './pages/Games';
import LevelingCurves from './pages/LevelingCurves';
import Minions from './pages/Minions';

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/games" element={<Games />} />
        <Route path="/games/:id" element={<GameDetail />} />
        <Route path="/leveling-curves" element={<LevelingCurves />} />
        <Route path="/minions" element={<Minions />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}

