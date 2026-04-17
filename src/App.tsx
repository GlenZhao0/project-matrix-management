import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import ProjectListPage from './pages/ProjectListPage';
import CreateProjectPage from './pages/CreateProjectPage';
import ProjectDetailPage from './pages/ProjectDetailPage';
import TemplatePage from './pages/TemplatePage';
import SystemSettingsPage from './pages/SystemSettingsPage';
import Sidebar from './components/Sidebar';
import { ThemeProvider } from './theme/ThemeProvider';

const App: React.FC = () => {
  return (
    <ThemeProvider>
      <Router>
        <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: 'var(--bg-page)' }}>
          <Sidebar />
          <div
            style={{
              marginLeft: '220px',
              flex: 1,
              padding: '24px',
              width: 'calc(100% - 220px)',
              boxSizing: 'border-box',
              background: 'var(--bg-page-gradient)',
              color: 'var(--text-primary)',
            }}
          >
            <Routes>
              <Route path="/" element={<ProjectListPage />} />
              <Route path="/projects/new" element={<CreateProjectPage />} />
              <Route path="/projects/:id" element={<ProjectDetailPage />} />
              <Route path="/templates" element={<TemplatePage />} />
              <Route path="/settings" element={<SystemSettingsPage />} />
            </Routes>
          </div>
        </div>
      </Router>
    </ThemeProvider>
  );
};

export default App;
